import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import English from "./English";
import "../fonts.css";

document.documentElement.classList.add("st-root");
document.body.classList.add("st-body");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <English />
  </StrictMode>,
);
