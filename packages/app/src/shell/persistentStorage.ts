/**
 * Ask the device to keep the save.
 *
 * Storage a site writes is, by default, *best-effort*: a browser under disk pressure may throw
 * it away, and iOS has historically cleared script-writeable storage after about seven days
 * without a visit. A twelve-year career is the one thing this game asks a player to invest in,
 * and losing it to a fortnight's holiday is not a trade anybody agreed to.
 *
 * `navigator.storage.persist()` is the API that exists to say otherwise, and it is granted on
 * signals the browser chooses — an installed home-screen app being the strongest of them. So
 * this is asked for once per load, early, and its answer is never blocked on: a refusal costs
 * the durability guarantee and nothing else, and there is nothing useful to tell the player
 * about a decision they cannot influence from here.
 *
 * Note the ordering. `persisted()` first, because a re-request on a grant that already exists
 * is pointless work, and on some browsers a prompt.
 */
export function requestPersistentStorage(): void {
  void (async () => {
    try {
      const manager = navigator.storage;
      if (!manager?.persist) return;
      if (await manager.persisted()) return;
      await manager.persist();
    } catch {
      // Unsupported, refused, or thrown at from a locked-down context. The game plays either
      // way; this only ever changes how long a save survives neglect.
    }
  })();
}
