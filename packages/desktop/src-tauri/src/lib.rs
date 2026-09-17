// 桌面壳 Rust 侧：窗口 + 插件宿主（plugin-core 协议）+ 语料库存储。
// 安全边界：
// - 只读扫描插件目录 auk-plugin.json；权限白名单外的清单拒绝加载
// - 插件页面 HTML 经 srcDoc 渲染，无 fs/shell/network 直通；
//   唯一出口是宿主桥（postMessage → 白名单命令）
// - 语料文件名做路径净化（防目录穿越）

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize, Clone)]
pub struct TabContribution {
    pub label: String,
    pub entry: String,
}

#[derive(Serialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub tab: Option<TabContribution>,
}

/// 与 packages/plugin-core PERMISSION_WHITELIST 同源，改动须双侧同步
const ALLOWED_PERMISSIONS: &[&str] = &[
    "panel.log",
    "panel.state",
    "sim.trajectory.read",
    "corpus.write",
    "tab.render",
];

fn plugins_root() -> Option<std::path::PathBuf> {
    // 优先 cwd（开发），其次 exe 同级（打包后 resources 摆放约定）
    let cwd = std::env::current_dir()
        .ok()
        .filter(|p| p.join("plugins").is_dir());
    cwd.or_else(|| {
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.join("plugins")))
            .filter(|p| p.is_dir())
    })
}

fn load_manifest(dir: &std::path::Path) -> Option<PluginMeta> {
    let text = std::fs::read_to_string(dir.join("auk-plugin.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let perms_ok = v["permissions"].as_array().is_none_or(|ps| {
        ps.iter()
            .all(|p| ALLOWED_PERMISSIONS.contains(&p.as_str().unwrap_or("")))
    });
    if !perms_ok {
        return None; // 权限越界 → 拒绝加载
    }
    let tab = v["contributes"]["tab"]
        .as_object()
        .map(|t| TabContribution {
            label: t
                .get("label")
                .and_then(|l| l.as_str())
                .unwrap_or("插件")
                .to_string(),
            entry: t
                .get("entry")
                .and_then(|e| e.as_str())
                .unwrap_or("index.html")
                .to_string(),
        });
    Some(PluginMeta {
        id: v["id"].as_str().unwrap_or_default().to_string(),
        name: v["name"].as_str().unwrap_or_default().to_string(),
        version: v["version"].as_str().unwrap_or_default().to_string(),
        description: v["description"].as_str().map(String::from),
        tab,
    })
}

fn scan_plugins() -> Vec<PluginMeta> {
    let Some(root) = plugins_root() else {
        return Vec::new();
    };
    let Ok(rd) = std::fs::read_dir(&root) else {
        return Vec::new();
    };
    rd.flatten()
        .filter_map(|e| load_manifest(&e.path()))
        .filter(|m| !m.id.is_empty())
        .collect()
}

#[tauri::command]
fn list_plugins() -> Vec<PluginMeta> {
    scan_plugins()
}

/// 读取插件页面 HTML（只允许插件目录内的 entry 文件）
#[tauri::command]
fn read_plugin_page(id: String) -> Result<String, String> {
    let meta = scan_plugins()
        .into_iter()
        .find(|m| m.id == id)
        .ok_or("插件不存在或被拒绝加载")?;
    let entry = meta
        .tab
        .map(|t| t.entry)
        .unwrap_or_else(|| "index.html".into());
    // 路径净化：entry 不允许跳出插件目录
    if entry
        .split(['/', '\\'])
        .any(|seg| seg == ".." || seg.is_empty() && entry.contains(".."))
    {
        return Err("非法 entry 路径".into());
    }
    let Some(root) = plugins_root() else {
        return Err("plugins 目录不存在".into());
    };
    let path = root.join(&id).join(&entry);
    std::fs::read_to_string(&path).map_err(|e| format!("读取插件页面失败: {e}"))
}

fn corpus_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("数据目录不可用: {e}"))?
        .join("corpus");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建语料目录失败: {e}"))?;
    Ok(dir)
}

fn sanitize_name(name: &str) -> Result<String, String> {
    let ok = name.len() < 120
        && !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !name.contains("..");
    if ok {
        Ok(name.to_string())
    } else {
        Err("非法文件名".into())
    }
}

/// 保存语料（匿名 JSONL）到应用数据目录
#[tauri::command]
fn save_corpus_file(
    app: tauri::AppHandle,
    name: String,
    content: String,
) -> Result<String, String> {
    let name = sanitize_name(&name)?;
    let path = corpus_dir(&app)?.join(name);
    std::fs::write(&path, content).map_err(|e| format!("写入失败: {e}"))?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn list_corpus(app: tauri::AppHandle) -> Vec<String> {
    let Ok(dir) = corpus_dir(&app) else {
        return Vec::new();
    };
    std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().extension().is_some_and(|x| x == "jsonl"))
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default()
}

/// 读取语料文件内容（trainer 插件审计用）
#[tauri::command]
fn read_corpus_file(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let name = sanitize_name(&name)?;
    let path = corpus_dir(&app)?.join(name);
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_plugins,
            read_plugin_page,
            save_corpus_file,
            list_corpus,
            read_corpus_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
