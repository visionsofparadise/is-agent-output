import { linuxProvider } from "./linuxProvider";
import { unsupportedProvider } from "./unsupportedProvider";
import { windowsProvider } from "./windowsProvider";
import type { Provider } from "./Provider";

export const providerOf = (): Provider => {
	switch (process.platform) {
		case "win32": {
			return windowsProvider;
		}
		case "linux": {
			return linuxProvider;
		}
		default: {
			return unsupportedProvider;
		}
	}
};
