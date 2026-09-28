/**
 * A signal that gives up on a request after `ms`, answer and body alike.
 *
 * From a Russian connection a request to the club's server may be neither answered nor
 * refused: the ISP lets the first kilobytes through and holds the rest, and the request
 * hangs for minutes. A background read that waits for its own last answer — the hall
 * screen's pulse, the desk's — would stop until it let go. With this it gives up, and the
 * next beat asks again.
 *
 * `AbortSignal.timeout` would do, but Safari has it only from 16, and on an older iPhone
 * the club's mini-app runs in Safari's engine; a timer kept by hand works everywhere.
 */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
