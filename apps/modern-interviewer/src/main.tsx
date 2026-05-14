import { createRoot } from "react-dom/client";
import App from "./App";
import "@codaco/fresco-ui/styles.css";
import "@codaco/interview/styles.css";
import "./styles/tailwind.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

createRoot(rootElement).render(<App />);
