import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Guard against re-registration when vitest reuses a worker across test files
if ((GlobalRegistrator as any).registered === null) {
  GlobalRegistrator.register();
}

