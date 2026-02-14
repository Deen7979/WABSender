# Electron App Folder Structure (Proposed)

```
apps/
  desktop/
    package.json
    electron-builder.yml
    src/
      main/
        index.ts
        window.ts
        menu.ts
        updater.ts
        preload.ts
      renderer/
        index.tsx
        App.tsx
        routes/
        components/
        features/
          contacts/
          templates/
          campaigns/
          inbox/
          automation/
          reports/
        services/
          apiClient.ts
          wsClient.ts
          auth.ts
        state/
          store.ts
        styles/
          theme.ts
      shared/
        types/
        utils/
    assets/
    build/
```

Notes:
- `main/` is the Electron process (window lifecycle, IPC, updates).
- `renderer/` is the React UI.
- `shared/` hosts common types and utilities.
- SQLite is accessed via a local service in `renderer/services` or through IPC.
