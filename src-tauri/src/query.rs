// 搜索语法解析与匹配（和前端 search.js 的 parseQ 保持同样的语义）
// report  *.png  IMG_10?5*  ext:pdf,docx  size:>5mb  modified:7d  type:folder  /regex/  content:文本
use pinyin::ToPinyin;
use regex::{Regex, RegexBuilder};

pub struct Meta<'a> {
    pub name: &'a str,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64, // 毫秒时间戳
}

enum Cond {
    Ext(Vec<String>),
    Size(&'static str, f64),
    Since(i64),
    Type(bool),
    Glob(Regex),
    Never,
}

pub struct Query {
    conds: Vec<Cond>,
    terms: Vec<String>,
    regs: Vec<Regex>,
    pub content: Option<regex::bytes::Regex>,
}

fn unit(u: &str) -> f64 {
    match u {
        "k" | "kb" => 1024.0,
        "m" | "mb" => 1048576.0,
        "g" | "gb" => 1073741824.0,
        _ => 1.0,
    }
}

fn span(u: &str) -> i64 {
    const DAY: i64 = 86_400_000;
    match u {
        "h" => 3_600_000,
        "w" => 7 * DAY,
        "m" => 30 * DAY,
        "y" => 365 * DAY,
        _ => DAY,
    }
}

pub fn ext_of(name: &str) -> String {
    match name.rfind('.') {
        Some(i) if i > 0 => name[i + 1..].to_lowercase(),
        _ => String::new(),
    }
}

/// 拼音首字母：每个汉字换成首字母，其他字符转小写；只在名字含非 ASCII 字符时有意义
pub fn initials(name: &str) -> String {
    name.chars()
        .map(|c| match c.to_pinyin() {
            Some(p) => p.first_letter().to_string(),
            None => c.to_lowercase().collect(),
        })
        .collect()
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

impl Query {
    pub fn parse(q: &str) -> Query {
        let mut out = Query { conds: vec![], terms: vec![], regs: vec![], content: None };
        let size_re = Regex::new(r"(?i)^size:(>=|<=|>|<|=)?([\d.]+)([kmg]?b?)$").unwrap();
        let date_re = Regex::new(r"(?i)^(?:modified|date):(\d+)([hdwmy])$").unwrap();
        for tok in q.split_whitespace() {
            let low = tok.to_lowercase();
            if let Some(v) = low.strip_prefix("ext:") {
                let xs = v.split(',').map(|x| x.trim_start_matches('*').trim_start_matches('.').to_string()).collect();
                out.conds.push(Cond::Ext(xs));
            } else if let Some(c) = size_re.captures(tok) {
                let op = match c.get(1).map(|m| m.as_str()) {
                    Some(">") => ">",
                    Some("<") => "<",
                    Some("<=") => "<=",
                    Some("=") => "=",
                    _ => ">=",
                };
                let v: f64 = c[2].parse().unwrap_or(0.0) * unit(&c[3].to_lowercase());
                out.conds.push(Cond::Size(op, v));
            } else if let Some(c) = date_re.captures(tok) {
                let n: i64 = c[1].parse().unwrap_or(0);
                out.conds.push(Cond::Since(now_ms() - n * span(&c[2].to_lowercase())));
            } else if let Some(v) = low.strip_prefix("type:") {
                out.conds.push(Cond::Type(matches!(v, "folder" | "dir" | "文件夹")));
            } else if let Some(v) = low.strip_prefix("content:") {
                let pat = &tok[8..];
                if !v.is_empty() {
                    out.content = regex::bytes::RegexBuilder::new(&regex::escape(pat)).case_insensitive(true).build().ok();
                }
            } else if tok.len() > 2 && tok.starts_with('/') && tok.ends_with('/') {
                match RegexBuilder::new(&tok[1..tok.len() - 1]).case_insensitive(true).build() {
                    Ok(r) => out.regs.push(r),
                    Err(_) => out.conds.push(Cond::Never),
                }
            } else if tok.contains('*') || tok.contains('?') {
                let pat = regex::escape(tok).replace(r"\*", ".*").replace(r"\?", ".");
                match RegexBuilder::new(&format!("^{pat}$")).case_insensitive(true).build() {
                    Ok(r) => out.conds.push(Cond::Glob(r)),
                    Err(_) => out.conds.push(Cond::Never),
                }
            } else {
                out.terms.push(low);
            }
        }
        out
    }

    /// 只看名称和元数据（内容匹配另做，因为要读文件）
    pub fn matches(&self, m: &Meta) -> bool {
        for c in &self.conds {
            let ok = match c {
                Cond::Ext(xs) => !m.is_dir && xs.contains(&ext_of(m.name)),
                Cond::Size(op, v) => {
                    let s = m.size as f64;
                    !m.is_dir
                        && match *op {
                            ">" => s > *v,
                            "<" => s < *v,
                            "<=" => s <= *v,
                            "=" => (s - v).abs() <= v * 0.05,
                            _ => s >= *v,
                        }
                }
                Cond::Since(t) => m.modified >= *t,
                Cond::Type(dir) => m.is_dir == *dir,
                Cond::Glob(r) => r.is_match(m.name),
                Cond::Never => false,
            };
            if !ok {
                return false;
            }
        }
        if self.content.is_some() && m.is_dir {
            return false;
        }
        if !self.regs.iter().all(|r| r.is_match(m.name)) {
            return false;
        }
        if self.terms.is_empty() {
            return true;
        }
        let low = m.name.to_lowercase();
        let mut py: Option<String> = None;
        self.terms.iter().all(|t| {
            if low.contains(t.as_str()) {
                return true;
            }
            if m.name.is_ascii() || !t.bytes().all(|b| b.is_ascii_lowercase()) {
                return false;
            }
            py.get_or_insert_with(|| initials(m.name)).contains(t.as_str())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn f(name: &str, size: u64) -> Meta<'_> {
        Meta { name, is_dir: false, size, modified: now_ms() }
    }
    #[test]
    fn parse_and_match() {
        assert!(Query::parse("bg").matches(&f("年终总结报告.docx", 1)));
        assert!(Query::parse("REPORT").matches(&f("my_report.pdf", 1)));
        assert!(Query::parse("ext:pdf,docx").matches(&f("a.DOCX", 1)));
        assert!(!Query::parse("ext:pdf").matches(&f("a.docx", 1)));
        assert!(Query::parse("size:>5mb").matches(&f("a", 6 * 1048576)));
        assert!(!Query::parse("size:>5mb").matches(&f("a", 4 * 1048576)));
        assert!(Query::parse("IMG_10?5*").matches(&f("IMG_1025.jpg", 1)));
        assert!(Query::parse(r"/^IMG_\d+/").matches(&f("img_12.png", 1)));
        assert!(Query::parse("modified:7d").matches(&f("x", 1)));
        assert!(!Query::parse("type:folder").matches(&f("x", 1)));
        assert!(!Query::parse("/[/").matches(&f("x", 1)));
        assert!(Query::parse("content:hello").content.is_some());
    }
}
