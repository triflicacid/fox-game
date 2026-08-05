import {describe, it, expect} from "vitest";
import {Camera} from "./camera";
import {Vector2d} from "../geometry/vector2d";

describe("Camera", () => {
    describe("center", () => {
        it("returns the constructed center", () => {
            const camera = new Camera(new Vector2d(10, 20), 100, 100);
            expect(camera.getCenter()).toEqual(new Vector2d(10, 20));
        });

        it("setCenter moves the center", () => {
            const camera = new Camera(Vector2d.ZERO, 100, 100);
            camera.setCenter(new Vector2d(5, 7));
            expect(camera.getCenter()).toEqual(new Vector2d(5, 7));
        });

        it("setX changes only the X position", () => {
            const camera = new Camera(new Vector2d(10, 20), 100, 100);
            camera.setX(30);
            expect(camera.getCenter()).toEqual(new Vector2d(30, 20));
        });

        it("setY changes only the Y position", () => {
            const camera = new Camera(new Vector2d(10, 20), 100, 100);
            camera.setY(30);
            expect(camera.getCenter()).toEqual(new Vector2d(10, 30));
        });

        it("pan offsets the center by the given delta", () => {
            const camera = new Camera(new Vector2d(10, 20), 100, 100);
            camera.pan(new Vector2d(-3, 4));
            expect(camera.getCenter()).toEqual(new Vector2d(7, 24));
        });
    });

    describe("viewport size", () => {
        it("returns the constructed canvas size at default zoom", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            expect(camera.getWidth()).toBe(800);
            expect(camera.getHeight()).toBe(600);
        });

        it("setViewportSize resizes the viewport", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setViewportSize(1024, 768);
            expect(camera.getWidth()).toBe(1024);
            expect(camera.getHeight()).toBe(768);
        });
    });

    describe("view edges", () => {
        it("getViewX/getViewY return the top-left of the view", () => {
            const camera = new Camera(new Vector2d(100, 200), 400, 300);
            expect(camera.getViewX()).toBe(100 - 200);
            expect(camera.getViewY()).toBe(200 - 150);
        });
    });

    describe("isRectVisible", () => {
        it("returns true for a rect overlapping the view", () => {
            const camera = new Camera(Vector2d.ZERO, 100, 100);
            expect(camera.isRectVisible({x: 0, y: 0, w: 10, h: 10})).toBe(true);
        });

        it("returns false for a rect entirely outside the view", () => {
            const camera = new Camera(Vector2d.ZERO, 100, 100);
            expect(camera.isRectVisible({x: 1000, y: 1000, w: 10, h: 10})).toBe(false);
        });

        it("returns true for a rect only partially overlapping the view's edge", () => {
            const camera = new Camera(Vector2d.ZERO, 100, 100);
            // View spans x: [-50, 50], y: [-50, 50].
            expect(camera.isRectVisible({x: 45, y: 0, w: 20, h: 20})).toBe(true);
        });
    });

    describe("zoom", () => {
        it("defaults to 1", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            expect(camera.getZoom()).toBe(1);
        });

        it("setZoom sets the zoom level", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setZoom(2);
            expect(camera.getZoom()).toBe(2);
        });

        it("setZoom clamps to the upper bound", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setZoom(100);
            expect(camera.getZoom()).toBe(10);
        });

        it("setZoom clamps to the lower bound", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setZoom(0.01);
            expect(camera.getZoom()).toBe(0.1);
        });

        it("zoomBy multiplies the current zoom level", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.zoomBy(1.05);
            expect(camera.getZoom()).toBeCloseTo(1.05);
            camera.zoomBy(1 / 1.05);
            expect(camera.getZoom()).toBeCloseTo(1);
        });

        it("zoomBy clamps at the bounds instead of overshooting", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.zoomBy(1000);
            expect(camera.getZoom()).toBe(10);
            camera.zoomBy(0.0001);
            expect(camera.getZoom()).toBe(0.1);
        });

        it("zooming in shrinks the world-space viewport size", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setZoom(2);
            expect(camera.getWidth()).toBe(400);
            expect(camera.getHeight()).toBe(300);
        });

        it("zooming out grows the world-space viewport size", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setZoom(0.5);
            expect(camera.getWidth()).toBe(1600);
            expect(camera.getHeight()).toBe(1200);
        });

        it("zooming keeps the view centred on the camera's own center", () => {
            const camera = new Camera(new Vector2d(50, 50), 800, 600);
            camera.setZoom(2);
            expect(camera.getViewX()).toBe(50 - 200);
            expect(camera.getViewY()).toBe(50 - 150);
            expect(camera.isRectVisible({x: 40, y: 40, w: 20, h: 20})).toBe(true);
        });

        it("setViewportSize doesn't reset the zoom level", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setZoom(2);
            camera.setViewportSize(1024, 768);
            expect(camera.getZoom()).toBe(2);
            expect(camera.getWidth()).toBe(512);
            expect(camera.getHeight()).toBe(384);
        });
    });

    describe("screenToWorld", () => {
        it("maps the canvas origin to the view's top-left corner", () => {
            const camera = new Camera(new Vector2d(100, 200), 400, 300);
            expect(camera.screenToWorld(0, 0)).toEqual(new Vector2d(camera.getViewX(), camera.getViewY()));
        });

        it("maps the canvas centre to the camera's own centre", () => {
            const camera = new Camera(new Vector2d(100, 200), 400, 300);
            expect(camera.screenToWorld(200, 150)).toEqual(new Vector2d(100, 200));
        });

        it("scales down by the current zoom level", () => {
            const camera = new Camera(Vector2d.ZERO, 800, 600);
            camera.setZoom(2);
            expect(camera.screenToWorld(20, 10)).toEqual(new Vector2d(camera.getViewX() + 10, camera.getViewY() + 5));
        });
    });
});
