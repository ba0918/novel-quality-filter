import { render } from "preact";

function App() {
  return (
    <div style={{ padding: "16px" }}>
      <h1 style={{ fontSize: "16px", margin: "0 0 12px 0", color: "#7c83ff" }}>
        Novel Quality Filter
      </h1>
      <p style={{ fontSize: "13px", color: "#a0a0a0" }}>v0.1.0 — 動作中</p>
    </div>
  );
}

render(<App />, document.getElementById("app")!);
