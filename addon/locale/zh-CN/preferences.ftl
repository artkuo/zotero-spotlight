pref-shortcut-section = 快捷键
pref-shortcut-search-label = 打开 Spotlight 搜索
pref-shortcut-command-label = 打开命令模式
pref-shortcut-mod-p = { PLATFORM() ->
        [macos] ⌘+P
       *[other] Ctrl+P
    }
pref-shortcut-mod-shift-p = { PLATFORM() ->
        [macos] ⌘+⇧+P
       *[other] Ctrl+Shift+P
    }
pref-shortcut-mod-k = { PLATFORM() ->
        [macos] ⌘+K
       *[other] Ctrl+K
    }
pref-shortcut-mod-o = { PLATFORM() ->
        [macos] ⌘+O
       *[other] Ctrl+O
    }
pref-shortcut-off = 关闭
pref-shortcut-conflict-note = 选择已在使用的快捷键时，两个操作的快捷键会自动交换。
pref-results-section = 结果限制
pref-results-limit = 结果数量上限

pref-window-section = 窗口尺寸
pref-window-height = 高度 (px)
pref-window-width = 宽度 (px)
pref-search-section = 搜索
pref-search-annotations = 搜索批注
pref-restore-search = 重新打开 Spotlight 时恢复上一次搜索
pref-show-filter-hint-bar = 显示过滤提示栏
pref-priority-section = 图书馆与分类优先级
pref-priority-hint = 粘贴用于排序图书馆和分类的 JSON。在命令模式（Cmd/Ctrl+Shift+P）中运行“Copy Collection Priorities Template”可获取现成列表，然后删除不需要的行并调整行的顺序来设置优先级（越靠前优先级越高）。未列出的分类仍会被搜索，但排名较低。可选地添加 "resultTypes": {"item": 8, "pdf": 5, "note": 2} 来提升特定条目类型（有效键：item、note、pdf、epub、snapshot、annotation）。
pref-priority-status-valid = 已保存。新的搜索将使用这些优先级。
pref-priority-status-invalid = JSON 无效——更改未保存。
pref-reset-defaults = 恢复默认设置
