import { icons as replicaIcons } from '../replica/icons.js'

const path = d => [{ tag: 'path', attrs: { d } }]

export const icons = {
  ...replicaIcons,
  menu: path('M5 6h14M5 12h9M5 18h14'),
  message: path('M5 5h14v11H9l-4 3V5Zm4 4h6m-6 3h4'),
  file: path('M7 3h10v18H7V3Zm3 5h4m-4 4h4m-4 4h3'),
  preset: path('M5 5h14v14H5V5Zm3 4h8m-8 4h8m-8 4h5'),
  tool: path('M5 6h14M8 3v6m8 3v9M5 15h14m-7-3v6'),
  settings: path('M5 7h14M8 4v6m-3 7h14m-4-3v6M5 12h14m-7-3v6'),
  send: path('M4 5l16 7-16 7 3-7-3-7Zm3 7h8'),
  robot: path('M6 7h12v12H6V7Zm3 4h.01M15 11h.01M9 15h6M12 3v4'),
  palette: path('M4 5h16v14H4V5Zm4 4h8M8 13h5'),
}
