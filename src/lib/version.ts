import pkg from "../../package.json";

// Version de l'appli (package.json), affichée en bas du menu. À n'importer que côté serveur :
// un composant client embarquerait tout package.json dans le bundle ; on passe la chaîne.
export const APP_VERSION: string = pkg.version;
