//! URL content fetching for context enrichment.
//!
//! Fetches public web pages and converts HTML to plain text so the AI
//! can use the full page content alongside the screenshot.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use specta::Type;

// ============================================================================
// Constants
// ============================================================================

/// Request timeout in seconds
const FETCH_TIMEOUT_SECS: u64 = 10;

/// Maximum HTTP response body size (512 KB)
const MAX_RESPONSE_BYTES: usize = 512 * 1024;

/// Maximum output text length in characters
const MAX_TEXT_CHARS: usize = 50_000;

/// Maximum number of redirects to follow
const MAX_REDIRECTS: usize = 5;

/// User-Agent header sent with requests
const USER_AGENT: &str = "Komugi/1.0 (Desktop App)";

// ============================================================================
// Types
// ============================================================================

/// Successfully fetched and converted page content.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FetchedUrlContent {
    /// The original URL that was fetched
    pub url: String,
    /// Plain text extracted from the page
    pub text: String,
    /// Page title if found
    pub title: Option<String>,
    /// Whether the text was truncated to fit the limit
    pub truncated: bool,
}

/// Typed errors for URL fetch operations.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum UrlFetchError {
    /// URL failed validation (bad scheme, parse error)
    InvalidUrl { message: String },
    /// URL points to a private/internal host
    BlockedUrl { message: String },
    /// HTTP request failed
    FetchFailed { message: String },
    /// Request timed out
    Timeout,
    /// Response body exceeded size limit
    ContentTooLarge,
}

impl std::fmt::Display for UrlFetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidUrl { message } => write!(f, "Invalid URL: {message}"),
            Self::BlockedUrl { message } => write!(f, "Blocked URL: {message}"),
            Self::FetchFailed { message } => write!(f, "Fetch failed: {message}"),
            Self::Timeout => write!(f, "Request timed out"),
            Self::ContentTooLarge => write!(f, "Response too large"),
        }
    }
}

// ============================================================================
// URL Validation
// ============================================================================

/// Validates a URL: must be http(s), must not point to a private host.
fn validate_url(raw: &str) -> Result<url::Url, UrlFetchError> {
    let parsed = url::Url::parse(raw).map_err(|e| UrlFetchError::InvalidUrl {
        message: format!("Failed to parse URL: {e}"),
    })?;

    match parsed.scheme() {
        "http" | "https" => {}
        scheme => {
            return Err(UrlFetchError::InvalidUrl {
                message: format!("Only http/https allowed, got: {scheme}"),
            });
        }
    }

    let host = parsed.host_str().ok_or_else(|| UrlFetchError::InvalidUrl {
        message: "URL has no host".to_string(),
    })?;

    if is_private_host(host) {
        return Err(UrlFetchError::BlockedUrl {
            message: format!("Private/internal hosts are blocked: {host}"),
        });
    }

    Ok(parsed)
}

/// Returns true if the host resolves to a private/internal address.
fn is_private_host(host: &str) -> bool {
    // Block well-known private hostnames
    let lower = host.to_lowercase();
    if lower == "localhost"
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower == "[::1]"
    {
        return true;
    }

    // Try to parse as IP address
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return is_private_ip(ip);
    }

    // Check bracketed IPv6
    let trimmed = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = trimmed.parse::<std::net::IpAddr>() {
        return is_private_ip(ip);
    }

    false
}

/// Checks if an IPv4 address is private, loopback, or link-local.
fn is_private_v4(v4: std::net::Ipv4Addr) -> bool {
    v4.is_loopback()        // 127.x.x.x
        || v4.is_private()  // 10.x, 172.16-31.x, 192.168.x
        || v4.is_link_local() // 169.254.x.x
        || v4.is_unspecified() // 0.0.0.0
        || v4.is_broadcast() // 255.255.255.255
}

/// Checks if an IP address is private, loopback, link-local, or otherwise non-public.
/// Covers IPv4-mapped IPv6 (::ffff:x.x.x.x), link-local, and unique-local ranges.
fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => is_private_v4(v4),
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback()       // ::1
                || v6.is_unspecified() // ::
                // IPv4-mapped IPv6: ::ffff:127.0.0.1 etc.
                || v6.to_ipv4_mapped().is_some_and(is_private_v4)
                // IPv6 link-local: fe80::/10
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                // IPv6 unique-local: fc00::/7
                || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

// ============================================================================
// Title Extraction
// ============================================================================

/// Returns a lazily-compiled regex for matching HTML title tags.
fn title_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"(?i)<title[^>]*>(.*?)</title>").unwrap())
}

/// Extracts the <title> from raw HTML using a simple regex.
fn extract_title(html: &str) -> Option<String> {
    // Only search first 10KB for the title tag
    let search_area = &html[..html.len().min(10_240)];
    let caps = title_regex().captures(search_area)?;
    let raw = caps.get(1)?.as_str().trim();
    if raw.is_empty() {
        return None;
    }
    // Decode basic HTML entities
    let decoded = raw
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    Some(decoded)
}

// ============================================================================
// HTTP Fetch Helpers
// ============================================================================

/// Builds a reqwest client with SSRF-safe redirect policy.
fn build_client() -> Result<reqwest::Client, UrlFetchError> {
    let redirect_policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            return attempt.stop();
        }
        let is_blocked = attempt.url().host_str().is_some_and(is_private_host);
        if is_blocked {
            attempt.error(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "Redirect to private host blocked",
            ))
        } else {
            attempt.follow()
        }
    });

    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECS))
        .redirect(redirect_policy)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| UrlFetchError::FetchFailed {
            message: format!("Failed to build HTTP client: {e}"),
        })
}

/// Maps a reqwest error to the appropriate UrlFetchError variant.
fn map_reqwest_error(e: reqwest::Error) -> UrlFetchError {
    if e.is_timeout() {
        UrlFetchError::Timeout
    } else {
        UrlFetchError::FetchFailed {
            message: format!("{e}"),
        }
    }
}

/// Reads the response body with a size limit, converts HTML to text, and truncates.
fn process_response(html: &str, url: &str) -> Result<FetchedUrlContent, UrlFetchError> {
    let title = extract_title(html);

    let text =
        html2text::from_read(html.as_bytes(), 80).map_err(|e| UrlFetchError::FetchFailed {
            message: format!("HTML to text conversion failed: {e}"),
        })?;

    let truncated = text.len() > MAX_TEXT_CHARS;
    let final_text = if truncated {
        let end = text
            .char_indices()
            .nth(MAX_TEXT_CHARS)
            .map(|(i, _)| i)
            .unwrap_or(text.len());
        text[..end].to_string()
    } else {
        text
    };

    log::info!(
        "URL fetched: {} chars, truncated={truncated}, title={:?}",
        final_text.len(),
        title
    );

    Ok(FetchedUrlContent {
        url: url.to_string(),
        text: final_text,
        title,
        truncated,
    })
}

// ============================================================================
// Command
// ============================================================================

/// Fetches a public URL and returns its content as plain text.
#[tauri::command]
#[specta::specta]
pub async fn fetch_url_content(url: String) -> Result<FetchedUrlContent, UrlFetchError> {
    let validated = validate_url(&url)?;
    log::info!("Fetching URL for context enrichment: {validated}");

    let client = build_client()?;

    let response = client
        .get(validated.as_str())
        .send()
        .await
        .map_err(map_reqwest_error)?;

    if !response.status().is_success() {
        return Err(UrlFetchError::FetchFailed {
            message: format!("HTTP {}", response.status()),
        });
    }

    // Reject if Content-Length header exceeds limit (may be absent for chunked)
    let content_length = response.content_length().unwrap_or(0) as usize;
    if content_length > MAX_RESPONSE_BYTES {
        return Err(UrlFetchError::ContentTooLarge);
    }

    let bytes = response.bytes().await.map_err(map_reqwest_error)?;

    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(UrlFetchError::ContentTooLarge);
    }

    let html = String::from_utf8_lossy(&bytes);
    process_response(&html, &url)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_https_url() {
        assert!(validate_url("https://example.com").is_ok());
    }

    #[test]
    fn validates_http_url() {
        assert!(validate_url("http://example.com").is_ok());
    }

    #[test]
    fn rejects_ftp_scheme() {
        assert!(matches!(
            validate_url("ftp://example.com"),
            Err(UrlFetchError::InvalidUrl { .. })
        ));
    }

    #[test]
    fn rejects_javascript_scheme() {
        assert!(matches!(
            validate_url("javascript:alert(1)"),
            Err(UrlFetchError::InvalidUrl { .. })
        ));
    }

    #[test]
    fn blocks_localhost() {
        assert!(matches!(
            validate_url("http://localhost:3000"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_loopback_ip() {
        assert!(matches!(
            validate_url("http://127.0.0.1:8080"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_private_ip_10() {
        assert!(matches!(
            validate_url("http://10.0.0.1"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_private_ip_192() {
        assert!(matches!(
            validate_url("http://192.168.1.1"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_private_ip_172() {
        assert!(matches!(
            validate_url("http://172.16.0.1"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_link_local() {
        assert!(matches!(
            validate_url("http://169.254.1.1"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_dot_local_tld() {
        assert!(matches!(
            validate_url("http://myhost.local"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_dot_internal_tld() {
        assert!(matches!(
            validate_url("http://service.internal"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_ipv6_loopback() {
        assert!(matches!(
            validate_url("http://[::1]:8080"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_ipv4_mapped_ipv6_loopback() {
        assert!(matches!(
            validate_url("http://[::ffff:127.0.0.1]:8080"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_ipv4_mapped_ipv6_private() {
        assert!(matches!(
            validate_url("http://[::ffff:10.0.0.1]"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_ipv4_mapped_ipv6_192() {
        assert!(matches!(
            validate_url("http://[::ffff:192.168.1.1]"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_ipv6_link_local() {
        assert!(matches!(
            validate_url("http://[fe80::1]"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_ipv6_unique_local() {
        assert!(matches!(
            validate_url("http://[fd00::1]"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn blocks_ipv6_unique_local_fc() {
        assert!(matches!(
            validate_url("http://[fc00::1]"),
            Err(UrlFetchError::BlockedUrl { .. })
        ));
    }

    #[test]
    fn extracts_title_from_html() {
        let html = r#"<html><head><title>Hello World</title></head></html>"#;
        assert_eq!(extract_title(html), Some("Hello World".to_string()));
    }

    #[test]
    fn extracts_title_case_insensitive() {
        let html = r#"<html><head><TITLE>My Page</TITLE></head></html>"#;
        assert_eq!(extract_title(html), Some("My Page".to_string()));
    }

    #[test]
    fn returns_none_for_empty_title() {
        let html = r#"<html><head><title>  </title></head></html>"#;
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn returns_none_for_no_title() {
        let html = r#"<html><head></head></html>"#;
        assert_eq!(extract_title(html), None);
    }

    #[test]
    fn decodes_html_entities_in_title() {
        let html = r#"<title>Foo &amp; Bar &lt;3&gt;</title>"#;
        assert_eq!(extract_title(html), Some("Foo & Bar <3>".to_string()));
    }
}
