const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) {
    throw new Error("Could not acquire 2D canvas context");
}

function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}

function draw(): void {
    ctx!.fillStyle = "#10140f";
    ctx!.fillRect(0, 0, canvas.width, canvas.height);

    ctx!.fillStyle = "#f2a65a";
    ctx!.font = "48px sans-serif";
    ctx!.textAlign = "center";
    ctx!.textBaseline = "middle";
    ctx!.fillText("Hello, fox", canvas.width / 2, canvas.height / 2);
}

window.addEventListener("resize", resize);
resize();
