// Copied from packages/wrangler/src/metrics/send-events.ts
import { getMetricsDispatcher } from "./metrics-dispatcher";
import type { Properties } from "./metrics-dispatcher";

/** These are event names used by c3 */
export type EventNames =
	| "session-started"
	| "session-cancelled"
	| "session-errored"
	| "session-completed"
	| "prompt-back";

/**
 * Send a metrics event, with no extra properties, to Cloudflare, if usage tracking is enabled.
 *
 * This overload assumes that you do not want to configure analytics with options.
 */
export function sendMetricsEvent(event: EventNames): Promise<void>;
/**
 * Send a metrics event to Cloudflare, if usage tracking is enabled.
 *
 * Generally you should pass the `send_metrics` property from the wrangler.toml config here,
 * which would override any user permissions.
 * Note: This is modified to simplify the function signature.
 */
export async function sendMetricsEvent(
	event: EventNames,
	properties?: Properties,
): Promise<void> {
	try {
		const metricsDispatcher = getMetricsDispatcher();
		await metricsDispatcher.sendEvent(event, properties);
	} catch (err) {
		console.debug("Error sending metrics event", err);
	}
}
