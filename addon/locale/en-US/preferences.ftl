pref-shortcut-section = Shortcuts
pref-shortcut-search-label = Open Spotlight search
pref-shortcut-command-label = Open command mode
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
pref-shortcut-off = Off
pref-shortcut-conflict-note = Choosing a shortcut already in use swaps the two assignments.
pref-results-section = Results
pref-results-limit = Results limit

pref-window-section = Window Size
pref-window-height = Height (px)
pref-window-width = Width (px)
pref-search-section = Search
pref-search-annotations = Search annotations
pref-restore-search = Restore last search when reopening Spotlight
pref-show-filter-hint-bar = Show filter hint bar
pref-priority-section = Library & Collection Priorities
pref-priority-hint = Paste JSON ranking libraries and collections. Run “Copy Collection Priorities Template” from command mode (Cmd/Ctrl+Shift+P) to get a ready-made list, then delete lines you don't want and reorder lines to set priority (top = highest). Items in unlisted collections stay searchable but rank lower. Optionally add "resultTypes": {"item": 8, "pdf": 5, "note": 2} to boost specific result types (valid keys: item, note, pdf, epub, snapshot, annotation).
pref-priority-status-valid = Saved. New searches use these priorities.
pref-priority-status-invalid = Invalid JSON — changes were not saved.
pref-reset-defaults = Reset to defaults
