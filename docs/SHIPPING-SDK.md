# Shipping the Memora SDK

How to publish **@memora/core** (and **@memora/shared**) so anyone can use the SDK without your env or infra.

---

## What’s required to publish and be used by people online

### To **publish** (npm)

| Requirement | Status |
|-------------|--------|
| **npm account** | Create at [npmjs.com](https://www.npmjs.com/signup); log in with `npm login`. |
| **Scoped name** | `@memora/core` is scoped; first publish must be `npm publish --access public`. |
| **Package metadata** | `packages/sdk` and `packages/shared` have `name`, `version`, `description`, `license` (MIT), and SDK has `repository`. Update `repository.url` to your real repo (e.g. `https://github.com/your-org/memora.git`). |
| **Build** | Publish built artifacts: `pnpm run build` from root; `dist/` must exist in each package. |
| **Publish order** | Publish **@memora/shared** first, then **@memora/core** (core depends on shared). Before publishing core, set `"@memora/shared": "^0.1.0"` in `packages/sdk/package.json` (not `workspace:*`). |
| **shared is publishable** | In `packages/shared/package.json` remove `"private": true` when you are ready to publish shared. |

### To be **used by people online**

The SDK is only a client. For real use you need **one** of:

1. **Hosted Memora API (recommended for “use by anyone”)**  
   You run indexer + key-broker (and Supabase, HCS, contract, Pinata) and expose:
   - `https://your-indexer.example.com`
   - `https://your-keybroker.example.com`  
   Users: `npm install @memora/core` and pass those URLs. They never see your .env.

2. **Self-hosted by each user**  
   Users clone this repo, deploy their own indexer, key-broker, Hedera, Supabase, Pinata, then use the SDK with their own URLs.

So: **publish** = npm packages anyone can install. **Used online** = either you provide a hosted API or users run the full stack themselves.

---

## 1. SDK is already env-agnostic

- **@memora/core** does not read `process.env`. It only uses the config you pass to `new MemoraClient({ indexerBaseUrl, keyBrokerBaseUrl, ipfsGatewayUrl })`.
- Consumers can get those URLs from their own env, config, or a hosted Memora API.
- No code change is required to “remove” env dependency from the SDK itself.

## 2. Publish to npm

You have two packages that need to be published (shared first, then core).

### Option A: Publish both packages from the monorepo

**2.1 Publish @memora/shared**

```bash
cd packages/shared
# Remove "private": true from package.json if present
pnpm build
npm publish --access public
```

**2.2 Point @memora/core at the published shared**

In `packages/sdk/package.json`, change the dependency from workspace to the published version:

```json
"dependencies": {
  "@memora/shared": "^0.1.0"
}
```

Then publish the SDK:

```bash
cd packages/sdk
pnpm build
npm publish --access public
```

(Use the same version you published for shared, e.g. `^0.1.0`.)

### Option B: Use pnpm publish with workspace protocol

From repo root, with both packages versioned and not private:

```bash
pnpm run build
pnpm -r publish --access public
```

Publish **shared** first (or ensure the registry already has the version core depends on). If using `workspace:*`, you may need to run publish from each package directory and temporarily set `"@memora/shared": "^0.1.0"` in the SDK for the publish.

## 3. Scoped package access

If the package is **@memora/core**, npm treats it as scoped. For a free public publish use:

```bash
npm publish --access public
```

## 4. What consumers need

- **Only the SDK:**  
  `npm install @memora/core`  
  They pass their own (or your hosted) **indexerBaseUrl** and **keyBrokerBaseUrl**. No .env required by the SDK.

- **To use your chain/service:**  
  If you run a **hosted** indexer + key-broker, give users the base URLs (e.g. `https://indexer.memora.xyz`, `https://keybroker.memora.xyz`). They use the SDK with those URLs; their app never touches your .env.

- **To run their own stack:**  
  They use the main Memora repo to deploy indexer, key-broker, contracts, HCS, Supabase, and Pinata, then point the SDK at their own URLs.

## 5. Checklist before publish

- [ ] `packages/sdk/README.md` documents config (no .env) and install/usage.
- [ ] `packages/sdk/package.json`: `files`, `exports`, `engines` set; version bumped.
- [ ] `packages/shared`: build succeeds; remove `"private": true` if you want to publish it.
- [ ] Run `pnpm run build` from repo root; run SDK tests if any.
- [ ] Publish **@memora/shared** first, then **@memora/core** (or bundle shared into core and publish one package).

## 6. Hosted service (optional)

To let “anyone use this service on-chain” without running infra:

1. Run indexer + key-broker (and any auth) in your own environment with your .env.
2. Expose them at public URLs (e.g. behind a domain and HTTPS).
3. Document the public base URLs for the SDK.
4. Consumers install `@memora/core` and pass those URLs — no access to your env or secrets.
