import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

document.addEventListener("DOMContentLoaded", () => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("Root element not found!");
    return;
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});