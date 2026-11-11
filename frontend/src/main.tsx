import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createAuth } from "./auth";
import { loadConfig } from "./config";
import "./styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

async function start() {
  try {
    const config = await loadConfig();
    const auth = await createAuth(config);
    root.render(
      <StrictMode>
        <App config={config} auth={auth} />
      </StrictMode>,
    );
  } catch (error) {
    // Config or OIDC callback failed before React could show a screen.
    console.error(error);
    root.render(
      <main className="center-screen center-screen-warn" role="alert">
        <h1>System not available</h1>
        <p>The application could not start. Please reload the page.</p>
      </main>,
    );
  }
}

void start();
