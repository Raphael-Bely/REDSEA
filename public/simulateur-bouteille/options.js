// Lu avant le premier affichage : pose les classes du mode intégré sur <html> pour éviter un flash du panneau.
// Options d'URL : ?embed=1 (scène seule) · ?hud=1 (avec ?embed : garde les boutons) · ?label=<clé du manifest> · ?spin=1 · ?fog=0
const RS_PARAMS=new URLSearchParams(location.search);
if(RS_PARAMS.get('embed')==='1')document.documentElement.classList.add('embed');
if(RS_PARAMS.get('hud')==='1')document.documentElement.classList.add('hud-on');
