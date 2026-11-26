import { useEffect, useRef, useState } from "react";
import { cx, Icon } from "./ui";

type Props = {
  file: File | null;
  onFile: (file: File | null) => void;
  /** Only the visible tab takes images pasted from the clipboard. */
  active: boolean;
  disabled?: boolean;
  /** Short prompt for a small drop area. */
  compact?: boolean;
  className?: string;
};

/** Pick, drop or paste one image; shows its preview. */
export function ImageDrop({ file, onFile, active, disabled, compact, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!active || disabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (image) {
        event.preventDefault();
        onFile(image);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active, disabled, onFile]);

  const take = (files: FileList | null) => {
    const image = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (image) onFile(image);
  };

  return (
    <div
      className={cx(
        "relative flex min-h-28 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-white transition-colors",
        over ? "border-highlight bg-brand-soft" : "border-line",
        className,
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) take(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      {preview ? (
        <>
          <img src={preview} alt={file?.name ?? "Imagen seleccionada"} className="max-h-full max-w-full object-contain" />
          <div className="absolute right-2 bottom-2 flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="rounded-md bg-white/95 px-2.5 py-1 text-sm font-semibold text-ink shadow hover:text-brand disabled:opacity-50"
            >
              Cambiar
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onFile(null)}
              className="rounded-md bg-white/95 px-2.5 py-1 text-sm font-semibold text-danger shadow disabled:opacity-50"
            >
              Quitar
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center text-muted hover:text-brand disabled:opacity-50"
        >
          <Icon name="image" className={compact ? "size-7 shrink-0" : "size-8"} />
          <span className="font-semibold">{compact ? "Cargar foto" : "Arrastra una imagen aquí"}</span>
          <span className="text-sm">{compact ? "clic, arrastrar o pegar" : "o haz clic para elegirla; también puedes pegarla"}</span>
        </button>
      )}
    </div>
  );
}
