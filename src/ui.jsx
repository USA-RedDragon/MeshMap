import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

/** mount renders the app around the map that boot started. */
export function mount(boot) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App boot={boot} />
    </React.StrictMode>,
  );
}
