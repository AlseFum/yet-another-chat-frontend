import { icons as replicaIcons } from '../replica/icons.js'

const path = d => [{ tag: 'path', attrs: { d } }]

export const icons = {
  ...replicaIcons,
  menu: path('M4 6h16M4 12h10M4 18h16'),
  message: path('M4 5h16v12H9l-5 3V5Zm4 5h8m-8 3h5'),
  file: path('M6 3h12v18H6V3Zm3 5h6M9 12h6M9 16h4'),
  preset: path('M5 5h14v14H5V5Zm3 4h8m-8 3h8m-8 3h4'),
  tool: path('M5 5h14v4H5V5Zm0 10h14v4H5v-4Zm4-6v6m6-6v6'),
  key: path('M6 15a4 4 0 1 1 4-4 4 4 0 0 1-4 4Zm3-3 10-8m-3 2 2 2m-4 0 2 2'),
  bolt: path('m13 2-8 12h6l-1 8 9-13h-6Z'),
  settings: path('M5 6h14M8 3v6m-3 9h14m-4-3v6M5 12h14m-8-3v6'),
  transfer: path('M4 8h12m-3-3 3 3-3 3m7 5H8m3-3-3 3 3 3'),
  robot: path('M5 7h14v12H5V7Zm4 4h.01M15 11h.01M9 15h6M12 3v4'),
  palette: path('M4 5h16v14H4V5Zm4 4h8M8 13h5'),
  info: path('M12 11v5m0-8h.01M4 4h16v16H4V4Z'),
  check: path('M5 12l4 4L19 6'),
  close: path('m6 6 12 12m0-12L6 18'),
  chevron: path('m6 9 6 6 6-6'),
}
