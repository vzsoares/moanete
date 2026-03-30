/// <reference types="vite/client" />

interface DocumentPictureInPicture {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}
