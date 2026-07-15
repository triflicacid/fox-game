const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) {
    throw new Error("Could not acquire 2D canvas context");
}

const foxImage = new Image();
let foxImageLoaded = false;
foxImage.onload = () => {
    foxImageLoaded = true;
    draw();
};
foxImage.src = "./static/fox.png";

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

    if (foxImageLoaded) {
        const size = 128;
        ctx!.drawImage(
            foxImage,
            canvas.width / 2 - size / 2,
            canvas.height / 2 + 32,
            size,
            size,
        );
    }
}

window.addEventListener("resize", resize);
resize();
