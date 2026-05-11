-- v62: Tenant wordmark (separate from logoUrl)
--
-- logoUrl is the compact square mark (favicon, topbar, login hero).
-- For wide surfaces — chiefly the printed/thermal invoice receipt —
-- a horizontal wordmark reads better than the same square scaled up.
-- Adds a nullable wordmarkUrl that the receipt prefers when set, with
-- a graceful fallback chain (receipt → wordmarkUrl ?? logoUrl ?? text
-- masthead). Nullable + no default so existing tenants stay unchanged.

ALTER TABLE tenants
  ADD COLUMN "wordmarkUrl" TEXT;
