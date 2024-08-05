/// <reference types="vite/client" />
declare module "*?script" {
    const fileName: string;
    export default fileName;
}
