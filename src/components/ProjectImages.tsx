import { useEffect, useState } from "react";
import { idbGet, idbSet } from "@/lib/idb-storage";
import { readProjectImage, type ProjectImage } from "@/lib/project-assets";
export function ProjectImages({ scope, onChange, onUse }: {
  scope: string; onChange: (images: ProjectImage[]) => void; onUse: (image: ProjectImage) => void;
}) {
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [readyScope, setReadyScope] = useState("");
  const [message, setMessage] = useState("");
  const key = "project-images:" + scope;
  useEffect(() => {
    let active = true; setReadyScope(""); setImages([]); onChange([]);
    void idbGet<ProjectImage[]>(key).then(items => {
      if (active) { setImages(items ?? []); onChange(items ?? []); setReadyScope(scope); }
    });
    return () => { active = false; };
  }, [scope]);
  async function save(next: ProjectImage[]) {
    if (next.length > 8 || next.reduce((n, a) => n + a.dataUrl.length, 0) > 3_000_000)
      throw new Error("Keep up to 8 project images, totaling at most 3 MB.");
    if (!await idbSet(key, next)) throw new Error("Could not save images. Enable browser storage and retry.");
    setImages(next); onChange(next);
  }
  return <section className="obs-node" aria-label="Project images">
    <details><summary>Project images · {images.length}</summary>
      <p className="text-xs opacity-70">Upload before building or add images to an existing build. Images stay with this project on this device; images used in a build are embedded in its saved and exported HTML. Reference images are labeled context; describe the visual details you want followed.</p>
      <input aria-label="Upload project images" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        disabled={readyScope !== scope} onChange={async event => {
          const files = Array.from(event.target.files ?? []); event.target.value = "";
          try {
            const next = [...images];
            for (const file of files) next.push(await readProjectImage(file));
            await save(next); setMessage("Images saved. Select Use in build to place an image.");
          } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
        }}/>
      <div className="flex flex-wrap gap-3">{images.map(image => <div key={image.id} className="max-w-40">
        <img src={image.dataUrl} alt={image.name} className="h-20 w-32 object-contain"/>
        <p className="text-xs break-all">{image.name}</p>
        <select aria-label={"Image purpose for " + image.name} value={image.role} onChange={event => {
          void save(images.map(a => a.id === image.id ? { ...a, role: event.target.value as ProjectImage["role"] } : a)).catch(e => setMessage(e.message));
        }}><option value="content">Content image</option><option value="reference">Design reference</option></select>
        <button type="button" className="obs-chip" onClick={() => onUse(image)}>Use in build</button>
        <button type="button" className="obs-chip" onClick={() => void save(images.filter(a => a.id !== image.id)).catch(e => setMessage(e.message))}>Remove</button>
      </div>)}</div>
      <p role="status" className="text-xs">{message}</p>
    </details>
  </section>;
}
