/**
 * jsdom setup for the playability tier.
 *
 * Only shims the APIs the app legitimately uses that jsdom does not implement. Anything
 * beyond that would mean the tests are exercising a different app than the one that ships.
 */

// The theme provider reads this on mount and subscribes to changes.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// The fight replay auto-scrolls its feed and the router scrolls to top on navigation.
// jsdom *defines* these and then throws "Not implemented" from them, so they have to be
// replaced unconditionally rather than only when absent.
Element.prototype.scrollTo = () => {};
window.scrollTo = (() => {}) as typeof window.scrollTo;
// Same story: fighter creation scrolls its validation list into view on a failed submit, and
// jsdom does not implement this at all. Stubbed so a genuine error is not lost in the noise of
// an unhandled rejection every run.
Element.prototype.scrollIntoView = () => {};
