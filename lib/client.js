window.__ModuleLoader__.load({
	id: "dsh-zoom-viewer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const ReactDOM = require("react-dom");
		const h = React.createElement;
		const { useCallback, useEffect, useMemo, useRef, useState } = React;

		const RENDERER_ID = "dsh-zoom-viewer:image";
		const EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"];
		const BINARY_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"];
		const MIN_SCALE = 0.05;
		const MAX_SCALE = 16;
		const INSET = 12;
		const STEP = 1.25;

		const CSS = [
			".dzv-root{position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;user-select:none;-webkit-user-select:none}",
			".dzv-stage{position:absolute;inset:0;overflow:hidden;cursor:grab;touch-action:none;background:transparent}",
			".dzv-stage[data-dragging=\"true\"]{cursor:grabbing}",
			".dzv-img{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;max-width:none;max-height:none;user-select:none;-webkit-user-drag:none}",
			".dzv-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.88)}",
			".dzv-close{position:absolute;top:14px;right:14px;z-index:4;background:rgba(255,255,255,.14)}",
			".dzv-bar{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:3px;border-radius:9px;background:rgba(28,28,30,.92);color:#f3f3f5;box-shadow:0 2px 10px rgba(0,0,0,.28);font:500 11px/1.4 system-ui,-apple-system,\"Segoe UI\",sans-serif;opacity:.3;transition:opacity .18s ease;z-index:3}",
			".dzv-root:hover .dzv-bar,.dzv-bar:focus-within{opacity:1}",
			".dzv-btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:6px;cursor:pointer;text-align:center;font:inherit;color:inherit}",
			".dzv-btn:hover{background:rgba(127,127,127,.3)}",
			".dzv-btn[aria-pressed=\"true\"]{background:rgba(127,127,127,.42)}",
			".dzv-val{min-width:42px;text-align:center;font-variant-numeric:tabular-nums;opacity:.9}",
			".dzv-status{margin:16px;font:400 12px/1.6 system-ui,-apple-system,\"Segoe UI\",sans-serif;opacity:.7}",
		].join("");

		function Style() {
			return h("style", { "data-dzv-style": "" }, CSS);
		}

		/** Byte-sniffed media type, falling back to the address suffix. */
		function mediaTypeOf(data, address) {
			const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
			const at = (i) => (bytes.length > i ? bytes[i] : -1);
			if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
			if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
			if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return "image/gif";
			if (at(0) === 0x42 && at(1) === 0x4d) return "image/bmp";
			if (at(0) === 0x00 && at(1) === 0x00 && (at(2) === 0x01 || at(2) === 0x02)) return "image/x-icon";
			if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return "image/webp";
			let head = "";
			try {
				head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(2048, bytes.length))).trimStart();
			} catch {
				head = "";
			}
			head = head.replace(/^<\?xml[^>]*\?>\s*/i, "");
			if (head.startsWith("<svg") || head.startsWith("<!DOCTYPE svg")) return "image/svg+xml";
			const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(String(address ?? ""));
			const suffix = match === null ? "" : match[1].toLowerCase();
			if (suffix === "svg") return "image/svg+xml";
			if (suffix === "gif") return "image/gif";
			if (suffix === "webp") return "image/webp";
			if (suffix === "bmp") return "image/bmp";
			if (suffix === "ico") return "image/x-icon";
			if (suffix === "jpg" || suffix === "jpeg") return "image/jpeg";
			return "image/png";
		}

		function useObjectUrl(data, address) {
			const [url, setUrl] = useState();
			useEffect(() => {
				if (data === undefined) {
					setUrl(undefined);
					return;
				}
				let created;
				try {
					created = URL.createObjectURL(new Blob([data], { type: mediaTypeOf(data, address) }));
				} catch {
					setUrl(undefined);
					return;
				}
				setUrl(created);
				return () => {
					URL.revokeObjectURL(created);
				};
			}, [data, address]);
			return url;
		}

		function clamp(value, min, max) {
			return value < min ? min : value > max ? max : value;
		}

		/** Fit scale for a viewport: contain = whole image, width = panel width, one = intrinsic pixels. */
		function fitScale(mode, natural, size) {
			if (natural.w <= 0 || natural.h <= 0 || size.w <= 0 || size.h <= 0) return undefined;
			const usableW = Math.max(size.w - INSET * 2, 1);
			const usableH = Math.max(size.h - INSET * 2, 1);
			if (mode === "one") return 1;
			if (mode === "width") return usableW / natural.w;
			return Math.min(usableW / natural.w, usableH / natural.h);
		}

		function centered(scale, natural, size) {
			return {
				scale,
				tx: (size.w - natural.w * scale) / 2,
				ty: (size.h - natural.h * scale) / 2,
			};
		}

		function Zoomer(props) {
			const { data, address } = props;
			const url = useObjectUrl(data, address);
			const stageRef = useRef(null);
			const imgRef = useRef(null);
			const dragRef = useRef(null);
			const [natural, setNatural] = useState({ w: 0, h: 0 });
			const [size, setSize] = useState({ w: 0, h: 0 });
			const [mode, setMode] = useState("contain");
			const [custom, setCustom] = useState(null);
			const [dragging, setDragging] = useState(false);
			const [fullscreen, setFullscreen] = useState(false);

			useEffect(() => {
				setMode("contain");
				setCustom(null);
				setNatural({ w: 0, h: 0 });
			}, [data]);

			/** ResizeObserver-bound stage ref: re-measures whenever the stage node is (re)mounted. */
			const observerRef = useRef(null);
			const bindStage = useCallback((node) => {
				stageRef.current = node;
				if (observerRef.current !== null) {
					observerRef.current.disconnect();
					observerRef.current = null;
				}
				if (node === null) return;
				const measure = () => {
					const rect = node.getBoundingClientRect();
					setSize({ w: rect.width, h: rect.height });
				};
				measure();
				const observer = new ResizeObserver(measure);
				observer.observe(node);
				observerRef.current = observer;
			}, []);

			useEffect(() => () => {
				if (observerRef.current !== null) observerRef.current.disconnect();
			}, []);

			const fitted = useMemo(() => {
				const scale = fitScale(mode === "custom" ? "contain" : mode, natural, size);
				return scale === undefined ? undefined : centered(scale, natural, size);
			}, [mode, natural, size]);
			const view = mode === "custom" && custom !== null ? custom : fitted;

			const applyZoom = useCallback(
				(nextScale, anchorX, anchorY) => {
					if (view === undefined) return;
					const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
					const ratio = scale / view.scale;
					setMode("custom");
					setCustom({
						scale,
						tx: anchorX - (anchorX - view.tx) * ratio,
						ty: anchorY - (anchorY - view.ty) * ratio,
					});
				},
				[view],
			);

			const zoomBy = useCallback(
				(factor) => {
					if (view === undefined) return;
					applyZoom(view.scale * factor, size.w / 2, size.h / 2);
				},
				[applyZoom, view, size],
			);

			const fitTo = useCallback((next) => {
				setMode(next);
				setCustom(null);
			}, []);

			/** Ctrl+wheel (macOS pinch) and plain wheel both zoom; the panel has nothing else to scroll. */
			useEffect(() => {
				const node = stageRef.current;
				if (node === null) return;
				const onWheel = (event) => {
					event.preventDefault();
					const rect = node.getBoundingClientRect();
					const sensitivity = event.ctrlKey ? 0.01 : 0.0025;
					const factor = Math.exp(-event.deltaY * sensitivity);
					applyZoom(view === undefined ? 1 : view.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
				};
				node.addEventListener("wheel", onWheel, { passive: false });
				return () => node.removeEventListener("wheel", onWheel);
			}, [applyZoom, view, url, fullscreen]);

			useEffect(() => {
				if (!fullscreen) return;
				const onKey = (event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						setFullscreen(false);
					}
				};
				window.addEventListener("keydown", onKey, true);
				return () => window.removeEventListener("keydown", onKey, true);
			}, [fullscreen]);


			const onPointerDown = useCallback(
				(event) => {
					if (event.button !== 0 || view === undefined) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: view.tx, ty: view.ty };
					setDragging(true);
				},
				[view],
			);

			const onPointerMove = useCallback((event) => {
				const drag = dragRef.current;
				if (drag === null || drag.id !== event.pointerId) return;
				setCustom((current) => {
					const base = current === null ? drag : current;
					return {
						scale: base.scale,
						tx: drag.tx + (event.clientX - drag.x),
						ty: drag.ty + (event.clientY - drag.y),
					};
				});
				setMode("custom");
			}, []);

			const endDrag = useCallback((event) => {
				const drag = dragRef.current;
				if (drag === null) return;
				dragRef.current = null;
				setDragging(false);
				if (event !== undefined && event.pointerId !== undefined && event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
					event.currentTarget.releasePointerCapture(event.pointerId);
				}
			}, []);

			const percent = view === undefined ? undefined : Math.round(view.scale * 100);

			const stage = h(
				"div",
				{
					ref: bindStage,
					className: "dzv-stage",
					"data-dragging": dragging ? "true" : undefined,
					onPointerDown,
					onPointerMove,
					onPointerUp: endDrag,
					onPointerCancel: endDrag,
					onDoubleClick: () => fitTo("contain"),
				},
				url === undefined
					? h("p", { className: "dzv-status", role: "alert" }, "无法显示这张图片")
					: h("img", {
							ref: imgRef,
							className: "dzv-img",
							src: url,
							alt: props.alt ?? "图片预览",
							draggable: false,
							style:
								view === undefined
									? { transform: "none" }
									: { transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` },
							onLoad: (event) =>
								setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight }),
						}),
			);

			const bar = h(
				"div",
				{ className: "dzv-bar", role: "toolbar", "aria-label": "缩放工具栏" },
				h("button", { type: "button", className: "dzv-btn", "aria-label": "缩小", onClick: () => zoomBy(1 / STEP) }, "−"),
				h("span", { className: "dzv-val", "data-dzv-percent": true }, percent === undefined ? "—" : `${percent}%`),
				h("button", { type: "button", className: "dzv-btn", "aria-label": "放大", onClick: () => zoomBy(STEP) }, "+"),
				h("button", { type: "button", className: "dzv-btn", "aria-pressed": mode === "contain" ? "true" : "false", onClick: () => fitTo("contain") }, "适应"),
				h("button", { type: "button", className: "dzv-btn", "aria-pressed": mode === "width" ? "true" : "false", onClick: () => fitTo("width") }, "宽"),
				h("button", { type: "button", className: "dzv-btn", "aria-pressed": mode === "one" ? "true" : "false", onClick: () => fitTo("one") }, "1:1"),
				h("button", { type: "button", className: "dzv-btn", onClick: () => setFullscreen((value) => !value), "aria-label": fullscreen ? "退出全屏" : "全屏" }, fullscreen ? "退出" : "全屏"),
			);

			if (!fullscreen) return h("div", { className: "dzv-root" }, h(Style), stage, bar);
			return ReactDOM.createPortal(
				h(
					"div",
					{ className: "dzv-root dzv-overlay", "data-dzv-overlay": "", onDoubleClick: (event) => event.stopPropagation() },
					h(Style),
					stage,
					bar,
					h(
						"button",
						{ type: "button", className: "dzv-btn dzv-close", onClick: () => setFullscreen(false), "aria-label": "退出全屏" },
						"退出全屏 (Esc)",
					),
				),
				document.body,
			);
		}

		/** Slot body: the host hands us the complete bytes of the selected file. */
		function Body(props) {
			const content = props.content;
			const data = content !== undefined && content.kind === "bytes" ? content.data : undefined;
			if (data === undefined) {
				return h("p", { className: "dzv-status", role: "alert" }, "图片预览需要完整文件内容");
			}
			return h(Zoomer, { key: String(props.resourceAddress ?? ""), data, address: props.resourceAddress, alt: "图片预览" });
		}

		const DEFINITION = {
			id: RENDERER_ID,
			extensions: EXTENSIONS,
			binaryExtensions: BINARY_EXTENSIONS,
			title: () => "缩放图片",
			loading: "bytes-complete",
			wrap: false,
		};

		function apply(ctx) {
			const registry = ctx.documentPreviews;
			if (registry === undefined) {
				console.warn("[dsh-zoom-viewer] documentPreviews service is unavailable; viewer not registered");
				return;
			}
			ctx.effect(() => registry.register(DEFINITION), "dsh-zoom-viewer: renderer metadata");
			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.right.tab.document", () =>
						ctx.slots.register(
							{
								name: "sidebar.right.tab.document",
								key: RENDERER_ID,
							},
							Body,
						),
					),
				"dsh-zoom-viewer: viewer body",
			);
		}

		const inject = ["documentPreviews", "slots"];

		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-zoom-viewer";
		return module.exports;
	},
});