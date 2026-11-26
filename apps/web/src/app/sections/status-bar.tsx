import { useAppState } from "../app-state.js";

export function StatusBar({ cancelled, onCancel }: { readonly cancelled: boolean; readonly onCancel: () => void }) {
  const s = useAppState();
  const { state, conversionStatusText, projectName, dirty, image, settingsValid, convertImage, sourceFileName, imageStatus } = s;
  const running = state.kind === "running";
  const failed = state.kind === "error";
  const tone = running ? "running" : failed ? "error" : cancelled ? "cancelled" : state.kind === "stale" ? "stale" : "ok";
  return (
    <footer className={`status-bar status-bar-${tone}`} aria-label="Status bar">
      <div className="status-bar-message" role="status" aria-live="polite">
        {running ? <span className="status-bar-progress" role="progressbar" aria-label="Converting" aria-busy="true"><span /></span> : null}
        <span className="status-bar-text">
          {failed ? `Conversion failed: ${state.message}` : cancelled ? "Conversion cancelled." : conversionStatusText}
        </span>
      </div>
      <div className="status-bar-actions">
        {running ? <button type="button" className="status-bar-button" onClick={onCancel}>Cancel</button> : null}
        {failed || cancelled || state.kind === "stale"
          ? <button type="button" className="status-bar-button" disabled={image === null || !settingsValid} onClick={() => void convertImage()}>{failed ? "Retry" : "Convert"}</button>
          : null}
      </div>
      <div className="status-bar-project" title={sourceFileName ?? undefined}>
        <span className="status-bar-project-name">{projectName}</span>
        <span className="status-bar-image" title={imageStatus}>{image === null ? null : imageStatus.replace(/^Accepted /, "").replace(/ RGBA bytes\.?$/, "")}</span>
        <span>{image === null ? "No image" : dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
    </footer>
  );
}
