// Copied from packages/wrangler/src/metrics/metrics-dispatcher.ts
import { fetch } from "undici";
import { version as c3Version } from "../../package.json";
import { getDeviceId, getUserId } from "./metrics-config";

// The SPARROW_SOURCE_KEY is provided at esbuild time as a `define` for production and beta
// releases. Otherwise it is left undefined, which automatically disables metrics requests.
declare const SPARROW_SOURCE_KEY: string;
const SPARROW_URL = "https://sparrow.cloudflare.com";

export function getMetricsDispatcher() {
	return {
		/**
		 * Dispatch a event to the analytics target.
		 *
		 * The event should follow these conventions
		 *  - name is of the form `[action] [object]` (lower case)
		 *  - additional properties are camelCased
		 */
		async sendEvent(name: string, properties: Properties = {}): Promise<void> {
			await dispatch({ type: "event", name, properties });
		},

		/**
		 * Dispatch a user profile information to the analytics target.
		 *
		 * This call can be used to inform the analytics target of relevant properties associated
		 * with the current user.
		 */
		async identify(properties: Properties): Promise<void> {
			await dispatch({ type: "identify", name: "identify", properties });
		},
	};

	async function dispatch(event: {
		type: "identify" | "event";
		name: string;
		properties: Properties;
	}): Promise<void> {
		if (!SPARROW_SOURCE_KEY) {
			console.log(
				"Metrics dispatcher: Source Key not provided. Be sure to initialize before sending events.",
				event,
			);
			return;
		}

		const deviceId = getDeviceId();
		const userId = getUserId();

		console.debug(`Metrics dispatcher: Posting data ${JSON.stringify(event)}`);
		const body = JSON.stringify({
			deviceId,
			userId,
			event: event.name,
			properties: {
				category: "Workers",
				c3Version,
				os: process.platform + ":" + process.arch,
				...event.properties,
			},
		});

		// Do not await this fetch call.
		// Just fire-and-forget, otherwise we might slow down the rest of Wrangler.
		fetch(`${SPARROW_URL}/api/v1/${event.type}`, {
			method: "POST",
			headers: {
				Accept: "*/*",
				"Content-Type": "application/json",
				"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
			},
			mode: "cors",
			keepalive: true,
			body,
		}).catch((e) => {
			console.debug(
				"Metrics dispatcher: Failed to send request:",
				(e as Error).message,
			);
		});
	}
}

export type Properties = Record<string, unknown>;
