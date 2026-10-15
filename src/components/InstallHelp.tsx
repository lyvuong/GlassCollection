export default function InstallHelp() {
  return (
    <details className="card">
      <summary><strong>Install this app on your phone</strong></summary>
      <h3>iPhone / iPad (use Safari)</h3>
      <ol>
        <li>Open this site in <b>Safari</b> (installing from Chrome or other browsers is not supported on older iOS).</li>
        <li>Tap the <b>Share</b> button (square with an up arrow).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open <b>Glass</b> from your home screen. Allow <b>Camera</b> and <b>Location</b> when asked.</li>
      </ol>
      <h3>Android (use Chrome)</h3>
      <ol>
        <li>Open this site in <b>Chrome</b>.</li>
        <li>Tap the <b>⋮</b> menu, then <b>Install app</b> (or <b>Add to Home screen</b>).</li>
        <li>Confirm <b>Install</b>, then open <b>Glass</b> from your app drawer or home screen.</li>
      </ol>
      <p className="muted">After installing, always open the app from the home-screen icon. Updates appear as a banner inside the app.</p>
    </details>
  );
}
