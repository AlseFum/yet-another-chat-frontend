import "./tokens.css";
import { icons } from "./icons.js";

export default {
  id: "folio",
  label: "Folio",
  motion: "paper",
  icons,
  assets: {
    sectionMark: new URL("./assets/section-mark.svg", import.meta.url).href,
    workspaceMark: new URL("./assets/workspace-mark.svg", import.meta.url).href,
  },
};
