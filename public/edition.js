/*
 * Édition (beige ou noire) choisie par le visiteur pendant sa visite : appliquée avant le
 * premier affichage, pour éviter un éclair de l'autre palette. Fichier externe (et non script
 * en ligne) : la CSP n'autorise que les scripts du site. Voir src/palette.ts.
 */
(function () {
  try {
    var edition = sessionStorage.getItem('redsea:edition');
    if (edition === 'classique' || edition === 'noir') {
      document.documentElement.setAttribute('data-palette', edition);
    }
  } catch (error) {
    // Stockage indisponible : on garde l'édition par défaut.
  }
})();
