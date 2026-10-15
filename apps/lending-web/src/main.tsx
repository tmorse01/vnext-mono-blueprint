import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App.js";
import { startMocks } from "./mocks/browser.js";
import "./styles.css";

const start = async () => {
  if (import.meta.env.VITE_USE_MOCKS === "true") await startMocks();
  ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
};

void start();
