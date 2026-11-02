const INTERVAL = 10000;
const subscribers = new Set();
let timer;
let pending;
let versions;
let fetchedAt = -Infinity;
let attemptedAt = -Infinity;
let retryDelay = INTERVAL;

function active(subscriber) {
  return !subscriber.pauseWhenHidden || !document.hidden;
}

function notify(subscriber, value) {
  if (subscriber.pending) return;
  subscriber.pending = true;
  Promise.resolve().then(() => subscriber.listener(value)).catch(() => {}).finally(() => {
    subscriber.pending = false;
  });
}

function schedule() {
  clearTimeout(timer);
  if (pending || !Array.from(subscribers).some(active)) return;
  timer = setTimeout(() => {
    readStateVersions().catch(() => {});
  }, Math.max(0, Math.max(attemptedAt + retryDelay, fetchedAt + INTERVAL) - Date.now()));
}

export function readStateVersions() {
  if (pending) return pending;
  if (versions && Date.now() - fetchedAt < INTERVAL) return Promise.resolve(versions);
  if (Date.now() - attemptedAt < retryDelay) return Promise.reject(new Error("State polling is backing off"));
  attemptedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  pending = fetch("/api/state/version", { cache: "no-store", signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error("State versions unavailable");
      return response.json();
    })
    .then(value => {
      versions = value.keys || value;
      fetchedAt = Date.now();
      retryDelay = INTERVAL;
      subscribers.forEach(subscriber => {
        if (active(subscriber)) notify(subscriber, versions);
      });
      return versions;
    })
    .catch(error => {
      retryDelay = Math.min(retryDelay * 2, 60000);
      throw error;
    })
    .finally(() => {
      clearTimeout(timeout);
      pending = null;
      schedule();
    });
  return pending;
}

export function subscribeStateVersions(listener, options = {}) {
  const subscriber = { listener, pauseWhenHidden: !!options.pauseWhenHidden };
  subscribers.add(subscriber);
  if (active(subscriber) && versions && Date.now() - fetchedAt < INTERVAL) notify(subscriber, versions);
  schedule();
  return () => {
    subscribers.delete(subscriber);
    schedule();
  };
}

document.addEventListener("visibilitychange", () => {
  subscribers.forEach(subscriber => {
    if (active(subscriber) && versions && Date.now() - fetchedAt < INTERVAL) notify(subscriber, versions);
  });
  schedule();
});
