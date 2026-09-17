// 桌面壳 Rust 侧：窗口 + 插件清单列举（plugin-core 协议 host）
// 安全边界：只读扫描插件目录的 auk-plugin.json，不执行任意代码；
// 权限白名单（permissions）与 plugin-core TS 侧校验同源。

use serde::Serialize;

#[derive(Serialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
}

const ALLOWED_PERMISSIONS: &[&str] = &["panel.log", "panel.state", "sim.trajectory.read"];

fn scan_plugins() -> Vec<PluginMeta> {
    let dir = std::env::current_dir()
        .ok()
        .and_then(|p| {
            let d = p.join("plugins");
            d.is_dir().then_some(d)
        })
        .or_else(|| {
            let d = std::path::Path::new("plugins").to_path_buf();
            d.is_dir().then_some(d)
        });
    let Some(dir) = dir else {
        return Vec::new();
    };
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let manifest = entry.path().join("auk-plugin.json");
        let Ok(text) = std::fs::read_to_string(manifest) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        // 权限白名单校验（超出即拒绝加载）
        let perms_ok = v["permissions"].as_array().map_or(true, |ps| {
            ps.iter()
                .all(|p| ALLOWED_PERMISSIONS.contains(&p.as_str().unwrap_or("")))
        });
        if !perms_ok {
            continue;
        }
        out.push(PluginMeta {
            id: v["id"].as_str().unwrap_or_default().to_string(),
            name: v["name"].as_str().unwrap_or_default().to_string(),
            version: v["version"].as_str().unwrap_or_default().to_string(),
            description: v["description"].as_str().map(String::from),
        });
    }
    out
}

#[tauri::command]
fn list_plugins() -> Vec<PluginMeta> {
    scan_plugins()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_plugins])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
