/**
 * Configuration frontend.
 *
 * GOOGLE_CLIENT_ID : identifiant client OAuth Google (public, pas un secret).
 * À récupérer sur https://console.cloud.google.com/apis/credentials
 * Tant qu'il n'est pas renseigné ici ET côté backend (.env -> GOOGLE_CLIENT_ID),
 * le bouton "Continuer avec Google" affichera un message explicatif au lieu
 * de planter.
 */
export const GOOGLE_CLIENT_ID = '525074636854-a2dcs38m0a45ijv29svnn4k4ohtsprks.apps.googleusercontent.com';
