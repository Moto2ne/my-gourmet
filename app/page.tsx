"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db, storage } from "./firebase"; 
import {
addDoc,
collection,
deleteDoc,
doc,
onSnapshot,
orderBy,
query,
serverTimestamp,
updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Image from "next/image";
// ---------- Types ----------
export type Status = "want" | "booked" | "done";
export type Price = "" | "¥" | "¥¥" | "¥¥¥" | "¥¥¥¥";


export interface Photo {
id: string;
url: string; // Storage のダウンロードURL
createdAt: string; // ISO 文字列
}


export interface Place {
id: string;
name: string;
area?: string;
genre?: string;
priceRange?: Price;
url?: string;
status: Status;
rating?: number; // 0-5
note?: string;
photos: Photo[];
createdAt: string; // 表示用（Firestore の serverTimestamp はクエリで直接使えないため文字列も保持）
updatedAt: string;
}


interface Filters {
name?: string;
area?: string;
genre?: string;
status?: Status | "";
price?: Price;
}
// ---------- Helpers ----------
const uuid = () => (typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();
const cls = (...xs: Array<string | false | undefined | null>) => xs.filter(Boolean).join(" ");


function useQueryParam(key: string) {
const [value, setValue] = useState<string | null>(null);
useEffect(() => {
const url = new URL(window.location.href);
setValue(url.searchParams.get(key));
}, [key]);
return value;
}


export default function Page() {
// ?list=xxxx（無ければ "default"）で、人ごとのDBを分ける
const listId = useQueryParam("list") || "default";
const readOnly = useQueryParam("view") === "public";


const [places, setPlaces] = useState<Place[]>([]);
const [filters, setFilters] = useState<Filters>({ status: "" });
const [editId, setEditId] = useState<string | null>(null);
// Firestore 参照
const placesCol = useMemo(() => collection(db, "lists", listId, "places"), [listId]);


// Realtime 購読
useEffect(() => {
const q = query(placesCol, orderBy("updatedAt", "desc"));
const unsub = onSnapshot(q, (snap) => {
const arr: Place[] = snap.docs.map((d) => {
const x = d.data() as Place;
return {
id: d.id,
name: x.name,
area: x.area as string | undefined,
genre: x.genre as string | undefined,
priceRange: (x.priceRange ?? "") as Price,
url: x.url as string |  undefined,
status: x.status as Status,
rating: x.rating as number | undefined,
note: x.note as string | undefined,
photos: (x.photos ?? []) as Photo[],
createdAt: (x.createdAt ?? nowIso()) as string,
updatedAt: (x.updatedAt ?? nowIso()) as string,
};
});
setPlaces(arr);
});
return () => unsub();
}, [placesCol]);

const filtered = useMemo(() => {
return places
.filter((p) => (filters.status ? p.status === filters.status : true))
.filter((p) => (filters.price ? (p.priceRange || "") === filters.price : true))
.filter((p) => (filters.name ? p.name.toLowerCase().includes(filters.name.toLowerCase()) : true))
.filter((p) => (filters.area ? (p.area || "").toLowerCase().includes(filters.area.toLowerCase()) : true))
.filter((p) => (filters.genre ? (p.genre || "").toLowerCase().includes(filters.genre.toLowerCase()) : true));
}, [places, filters]);
// --- CRUD ---
async function savePlace(data: Omit<Place, "id" | "createdAt" | "updatedAt" | "photos"> & { photos?: Photo[] }) {
if (editId) {
await updateDoc(doc(placesCol, editId), {
...data,
updatedAt: nowIso(),
});
} else {
const createdAt = nowIso();
await addDoc(placesCol, {
...data,
photos: data.photos ?? [],
createdAt,
updatedAt: createdAt,
createdAtTS: serverTimestamp(), // 参考：並び替えに使いたければ別フィールドを用意
updatedAtTS: serverTimestamp(),
});
}
setEditId(null);
}


async function deletePlace(id: string) {
await deleteDoc(doc(placesCol, id));
if (editId === id) setEditId(null);
}


async function changeStatus(id: string, s: Status) {
await updateDoc(doc(placesCol, id), { status: s, updatedAt: nowIso(), updatedAtTS: serverTimestamp() });
}


async function addPhotos(id: string, files: FileList) {
const uploads = Array.from(files)
.slice(0, 6)
.map(async (file) => {
const path = `lists/${listId}/places/${id}/${uuid()}-${file.name}`;
const storageRef = ref(storage, path);
await uploadBytes(storageRef, file);
const url = await getDownloadURL(storageRef);
return { id: uuid(), url, createdAt: nowIso() } as Photo;
});


const newPhotos = await Promise.all(uploads);
const target = places.find((p) => p.id === id);
const merged = [...newPhotos, ...(target?.photos ?? [])].slice(0, 12);
await updateDoc(doc(placesCol, id), { photos: merged, updatedAt: nowIso(), updatedAtTS: serverTimestamp() });
}
return (
<div className="min-h-screen bg-neutral-50 text-neutral-900 p-4 md:p-8">
<header className="flex items-center justify-between mb-6">
<h1 className="text-2xl md:text-3xl font-bold">🍽️グルメ制覇リスト</h1>
<span className={cls(
"text-sm px-3 py-1 rounded-full",
readOnly ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
)}>{readOnly ? "閲覧専用" : "編集可能"}</span>
</header>



<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
<section className="md:col-span-2">
<FilterBar filters={filters} setFilters={setFilters} />
{filtered.length === 0 ? (
<div className="mt-6 p-6 rounded-2xl bg-white shadow-sm border">まだお店がありません。右側で追加してみてね。</div>
) : (
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
{filtered.map((p) => (
<Card
key={p.id}
place={p}
readOnly={readOnly}
onEdit={() => setEditId(p.id)}
onDelete={() => deletePlace(p.id)}
onStatusChange={(s) => changeStatus(p.id, s)}
onAddPhotos={(files) => addPhotos(p.id, files)}
/>
))}
</div>
)}
</section>


<section>
<Editor
key={editId || "new"}
readOnly={readOnly}
place={places.find((p) => p.id === editId) || null}
onCancel={() => setEditId(null)}
onSave={savePlace}
/>
</section>
</div>
</div>
);
}
// ---------- UI Components ----------
function Card({
  place,
  readOnly,
  onEdit,
  onDelete,
  onStatusChange,
  onAddPhotos,
}: {
  place: Place;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: Status) => void;
  onAddPhotos: (files: FileList) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-lg">{place.name}</span>
        <span className={cls(
          "text-xs px-2 py-1 rounded-full shrink-0",
          place.status === "done"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : place.status === "booked"
            ? "bg-amber-50 text-amber-700 border border-amber-200"
            : "bg-sky-50 text-sky-700 border border-sky-200"
        )}>
          {place.status}
        </span>
      </div>

      {place.url && (
        <a
          className="text-sm text-blue-600 hover:underline"
          href={place.url}
          target="_blank"
          rel="noreferrer"
        >
          🔗食べログなど
        </a>
      )}

      {place.note && (
        <p className="text-sm text-neutral-700 whitespace-pre-wrap">{place.note}</p>
      )}



{place.photos?.length > 0 && (
  <div className="grid grid-cols-3 gap-2">
    {place.photos.slice(0, 3).map((ph) => (
      <Image
        key={ph.id}
        src={ph.url}
        alt={place.name + "の写真"}
        className="rounded-xl w-full h-28 object-cover"
        width={300}
        height={112}
        style={{ objectFit: "cover" }}
      />
    ))}
  </div>
)}

      <div className="flex items-center gap-3 mt-1">
        <div className="text-sm text-neutral-700">
          {place.rating != null ? `⭐ ${place.rating}/5` : "—"}
        </div>
        {!readOnly && (
          <>
            <select
              className="text-sm border rounded-lg px-2 py-1"
              value={place.status}
              onChange={(e) => onStatusChange(e.target.value as Status)}
            >
              <option value="want">want</option>
              <option value="booked">booked</option>
              <option value="done">done</option>
            </select>
            <button
              className="text-sm px-3 py-1 rounded-lg border hover:bg-neutral-50"
              onClick={onEdit}
            >
              ✏️ 編集
            </button>
            <button
              className="text-sm px-3 py-1 rounded-lg border hover:bg-red-50 text-red-600"
              onClick={onDelete}
            >
              🗑️ 削除
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) =>
                e.currentTarget.files && onAddPhotos(e.currentTarget.files)
              }
            />
            <button
              className="text-sm px-3 py-1 rounded-lg border hover:bg-neutral-50"
              onClick={() => fileRef.current?.click()}
            >
              📸 写真
            </button>
          </>
        )}
      </div>
    </div>
  );
}
function Editor({ readOnly, place, onCancel, onSave }: { readOnly: boolean; place: Place | null; onCancel: () => void;   onSave: (data: Omit<Place, "id" | "createdAt" | "updatedAt" | "photos"> & { photos?: Photo[] }) => void;
}) {
  const [name, setName] = useState(place?.name || "");
  const [area, setArea] = useState(place?.area || "");
  const [genre, setGenre] = useState(place?.genre || "");
  const [price, setPrice] = useState<Price>(place?.priceRange || "");
  const [url, setUrl] = useState(place?.url || "");
  const [status, setStatus] = useState<Status>(place?.status || "want");
  const [rating, setRating] = useState<number>(place?.rating ?? 0);
  const [note, setNote] = useState(place?.note || "");

  const isEdit = Boolean(place);

  return (
    <div className="bg-white border rounded-2xl shadow-sm p-4 sticky top-4">
      <h2 className="text-lg font-semibold mb-3">{isEdit ? "編集" : "追加"}</h2>
      {readOnly && <div className="mb-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">閲覧専用モードのため編集できません。`?view=public` を外してください。</div>}

      <div className="grid grid-cols-2 gap-3">
        <Input label="店名*" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="ステータス" value={status} onChange={(e) => setStatus(e.target.value as Status)} options={["want", "booked", "done"]} />
        <Input label="エリア" value={area} onChange={(e) => setArea(e.target.value)} />
        <Input label="ジャンル" value={genre} onChange={(e) => setGenre(e.target.value)} />
        <Select label="価格帯" value={price} onChange={(e) => setPrice(e.target.value as Price)} options={["", "¥", "¥¥", "¥¥¥", "¥¥¥¥"]} />
        <Input label="URL (公式/食べログ)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="col-span-2">
          <label className="text-sm text-neutral-600">一言メモ（140文字まで）</label>
          <textarea className="w-full border rounded-xl px-3 py-2 mt-1" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <label className="text-sm text-neutral-600">評価</label>
          <input type="range" min={0} max={5} step={1} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
          <span className="text-sm">⭐ {rating}/5</span>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        {!readOnly && (
          <button
            className="px-4 py-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
            onClick={() => {
              if (!name.trim()) return alert("店名は必須です");
              onSave({
                name: name.trim(),
                area: area.trim(),
                genre: genre.trim(),
                priceRange: price,
                url: url.trim(),
                status,
                rating,
                note: note.trim(),
              });
            }}
          >保存</button>
        )}
        {isEdit && !readOnly && (
          <button className="px-4 py-2 rounded-xl border hover:bg-neutral-50" onClick={onCancel}>新規追加に切替</button>
        )}
      </div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
const { label, className, ...rest } = props;
return (
<label className="flex flex-col gap-1 text-sm text-neutral-600">
{label}
<input {...rest} className={cls("border rounded-xl px-3 py-2", className)} />
</label>
);
}


function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] }) {
const { label, options, className, ...rest } = props;
return (
<label className="flex flex-col gap-1 text-sm text-neutral-600">
{label}
<select {...rest} className={cls("border rounded-xl px-3 py-2", className)}>
{options.map((opt) => (
<option key={opt} value={opt}>{opt || "(指定なし)"}</option>
))}
</select>
</label>
);
}
function FilterBar({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        className="border rounded-xl px-3 py-2"
        placeholder="店名で検索"
        value={filters.name || ""}
        onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
      />
      <input
        className="border rounded-xl px-3 py-2"
        placeholder="エリア"
        value={filters.area || ""}
        onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value }))}
      />
      <input
        className="border rounded-xl px-3 py-2"
        placeholder="ジャンル"
        value={filters.genre || ""}
        onChange={(e) => setFilters((f) => ({ ...f, genre: e.target.value }))}
      />
      <select
        className="border rounded-xl px-3 py-2"
        value={filters.status || ""}
        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Status }))}
      >
        <option value="">(ステータス指定なし)</option>
        <option value="want">want</option>
        <option value="booked">booked</option>
        <option value="done">done</option>
      </select>
      <select
        className="border rounded-xl px-3 py-2"
        value={filters.price || ""}
        onChange={(e) => setFilters((f) => ({ ...f, price: e.target.value as Price }))}
      >
        <option value="">(価格帯指定なし)</option>
        <option value="¥">¥</option>
        <option value="¥¥">¥¥</option>
        <option value="¥¥¥">¥¥¥</option>
        <option value="¥¥¥¥">¥¥¥¥</option>
      </select>
    </div>
  );
}