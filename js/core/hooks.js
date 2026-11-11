// Late-bound calls. A few low-level modules need to call something that lives in a higher layer (for example refresh()).
// Importing it directly would make a circular import, so they import the forwarding function from here instead,
// and js/app.js registers the real functions with provide() once at start-up.
const H = {};
export const provide = (fns) => Object.assign(H, fns);
export const goStep = (...a) => H.goStep(...a);
export const loadJob = (...a) => H.loadJob(...a);
export const paintChrome = (...a) => H.paintChrome(...a);
export const paintGuide = (...a) => H.paintGuide(...a);
export const refresh = (...a) => H.refresh(...a);
export const renderProTools = (...a) => H.renderProTools(...a);
export const renderQuickBar = (...a) => H.renderQuickBar(...a);
export const renderShapeForm = (...a) => H.renderShapeForm(...a);
export const runPro = (...a) => H.runPro(...a);
export const setShapeFs = (...a) => H.setShapeFs(...a);
export const showSource = (...a) => H.showSource(...a);
export const useShape = (...a) => H.useShape(...a);
export const useShapeSoon = (...a) => H.useShapeSoon(...a);
