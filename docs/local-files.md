# Local files and isolated commands

The private owner chat now has real file tools built from Pi Durable 1.2.0's `createReadTool`, `createWriteTool` and `createEditTool`. They execute through a restricted `ExecutionEnv`, not unrestricted `CodingTools` or a normal host shell. `find` searches filenames or literal text across all granted folders; `folders` exposes configured scope. No new dependency is required.

## One-time enablement

Open Apps & actions → Local access, enter the real absolute path of a specific existing work folder and click Allow this folder. Reading is included. Edit/create and isolated commands are separate, initially unchecked choices. This implementation starts with no grants and does not modify existing persisted grants on activation. Grants persist in the owner's local settings and can be revoked there. Routine authorized reads and targeted edits need no further review.

Only regular UTF-8 text files up to512KB are supported. Hidden paths, known credential names/extensions and high-confidence credential content, databases, generated dependency folders, symbolic links and hard links are excluded. A file with an unknown secret format can still contain sensitive information: share only folders appropriate for the selected model provider. File/tool content is sent to that provider and saved in the private conversation. Creation requires an existing parent directory and never overwrites; use targeted edits for existing files. No original-file deletion, directory creation, rename or unrestricted shell tool is exposed. Edits check the read content hash before writing; this is not a filesystem transaction or automatic undo service.

Original reads/writes use descriptor-relative Unix `openat` traversal with `O_NOFOLLOW` on every component, regular-file and hard-link checks, bounded reads, restrictive new-file permissions, and host grant checks. This Bun implementation targets the current macOS machine (Unix libc file primitives); command execution fails closed off macOS. Grant configuration is owner-authenticated HTTP only, never an agent tool. Local tools are installed only on the private owner and private-work conversations. Channel agents never get file access; private handoff results remain in the owner app. Recovered inactive calls cannot regain local access.

## Commands

`command` proposes immutable command text + exact granted folder for a one-use owner review. On approval, a sanitized bounded text-only snapshot is made (5,000 entries,20MB, depth16; excludes hidden/sensitive/generated/linked/binary files). Pi's `NodeExecutionEnv.exec(argv)` starts a macOS `sandbox-exec` child with a clean environment. Seatbelt denies by default, allows only the temporary workspace and required system programs/libraries, and grants no network, Keychain or normal home access. It changes no OS security settings. Original folder contents cannot be accessed by an absolute-path escape.

Commands can modify their disposable copy only; nothing is copied back. No package installation, network-dependent build or unrestricted access to installed third-party runtimes/dependencies is promised. The command has a30-second wall timeout,15-second per-process CPU limit, per-file size/descriptor limits, temporary output monitoring and20,000-character retained output. Revoking a grant or shutting down aborts its running command tree. Reviews/results/activity are session-local, disappear on restart and are never automatically replayed. Use `command_result` after approval to inspect results; a proposed command has not run.

## Evidence

`bun test runtime/local-access.test.ts runtime/engine-local.test.ts` exercises actual Pi tools/Harness using disposable fixtures and a synthetic model: discovery, read, edit, create, repeated-grant use, persistence, revocation, known credential patterns, symlinks/hardlinks, outside paths, cancellation and actual macOS command isolation. UI tests intercept all runtime requests; they never grant access to personal folders. No real personal files are inspected for tests.

## Native folder selection

Local access includes **Choose folder** on macOS, with manual path entry as a fallback. The native dialog returns one validated existing folder path; it does not read files or grant access. Choose the permissions and submit **Allow access** separately. Cancellation keeps the previous path and permissions. Hidden, credential, system, whole-home and symlink paths are rejected; the existing grant endpoint remains the final authority.

The Next route `/api/local-access/choose-folder` accepts only an explicit same-origin local POST with `X-Pebble-User-Action: choose-folder`. It invokes a fixed AppleScript with no path interpolation, allows one dialog at a time and times out after two minutes. No model tool can invoke this route. Tests exercise request validation, path selection, cancellation, overlapping requests and invalid paths through an injected selector. A headless UI check mocked selection/cancellation, confirmed no automatic grants and no mobile overflow. Native dialog presentation has not been invoked during verification to avoid opening windows on the owner's desktop.
