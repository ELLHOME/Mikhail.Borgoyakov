import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Natal from "./Natal";
import "../fonts.css";

document.documentElement.classList.add("ef-root");
document.body.classList.add("ef-body");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Natal />
  </StrictMode>,
);
