"use client";

import { UploadCloud, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/admin/image-lightbox";
import { useFormat, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * ファイルを受け取る領域。
 *
 * 🚨 **`@shadcn/attachment` はアップローダーではない**（表示だけ）。ドロップ領域は shadcn に無いので
 * ここだけ自作する。`@shadcn/input-file` は**ネイティブの input を装飾しただけ**で、
 * 堀池さんが「使うな」と言っているものそのもの。
 *
 * 🚨 **「ファイルを選択 / ファイル未選択」を画面に出さない。**
 * それがオーナーの指摘の中身なので、`<input type="file">` は**隠して**、
 * クリックとドロップの両方をこの箱で受ける。
 *
 * 🚨 選んだものの表示は **`Attachment` に任せる**（サムネ・題名・削除・state を持っている）。
 * `AttachmentGroup` は横に並べると端がフェードする（§6 も同時に満たす）。
 */
type Props = {
  name?: string;
  /**
   * 選んだものが変わるたびに呼ばれる（**省略可**）。
   *
   * 🚨 **これが無いと、フォーム送信以外の経路では使えない。**
   * この部品はもともと「隠した input に載せて、**フォームと一緒に multipart で送る**」前提で、
   * 外へ渡す口が無かった。ところがロゴの欄は、選んだ瞬間に
   * `/api/onboarding/logo` へ**単独で POST** し、返った ID をフォームの値に使う。
   * 送り方が multipart かどうかは関係なく、**送る主体がフォームか部品の外か**が違う。
   *
   * 消したときも呼ぶ（**消した結果の配列**を渡す。空なら空配列）。
   */
  onSelect?: (files: File[]) => void;
  /**
   * `Surface` の中に置くときに真にする（**省略可**）。
   *
   * 🚨 選んだ後に出る `Attachment` は `rounded-xl border bg-card` を持つ＝**面**。
   * `Surface` の中だと 2段目になり、`/admin/files/new` では**深さ3**まで行っていた（実測）。
   * 面の中に面を作らない（憲章 §1）ため、そこでは**器を持たない**形にする。
   *
   * 🚨 **既定では剥がさない。** `Surface` の外（設定画面など）では
   * Attachment は深さ1で問題が無く、器を剥がすと「選んだファイル」の輪郭が消えて
   * かえって分かりにくくなる。
   */
  flat?: boolean;
  /**
   * 受けるものの大きさに合わせる（**省略可**・既定は `"default"`）。
   *
   * 由来（堀池・原典 L94 原文）:
   * > 「全てのセクション・要素はPCの場合横長になりすぎる。…
   * >   **ファイルアップも、その画像がただのロゴならアップロードUIもおおきくなくていい。
   * >   そのロゴのサイズとかにする。**」
   *
   * 🚨 **`"logo"` の寸法は発明していない。** ロゴが実際に描かれている大きさから決めた:
   * `left-sidebar.tsx:255` と `app/login/page.tsx:35` が**どちらも** `h-6 w-auto max-w-32`
   * （24px 高・最大 128px 幅）。その倍を上限にして `max-w-64`（256px）、
   * 高さは **SP で押せる下限（44px）を大きく上回る** `min-h-20`（80px）にしてある。
   * ロゴそのものの 24px にはしない——**それでは掴んで放す的が小さすぎる**。
   *
   * 🚨 クラス名を組み立てないこと（`min-h-${n}` のような書き方は Tailwind が消す）。分岐で丸ごと書く。
   */
  size?: "default" | "logo";
  /**
   * この領域が「何の」ファイルを受けるのかを名乗らせる（**省略可**・見出し要素の `id`）。
   *
   * 🚨 **4箇所すべて読み上げ名が同じ**だった。中の文字（「ここにファイルをドロップ」）
   * しか名前が無いので、読み上げで移動する人には**ロゴなのか添付なのかファイル追加なのか
   * 区別が付かない**。
   *
   * 🚨 **`aria-label` で上書きしないこと。** 見えている文字が読み上げ名から消えると、
   * 音声操作の人が**読み上げどおりに言っても押せなくなる**（WCAG 2.5.3 Label in Name）。
   * ここでは `aria-labelledby` に **渡された見出しの id と、自分の文字の id を並べる**ので、
   * 名前は「ロゴ ここにファイルをドロップ」になり、見えている文字が残る。
   */
  labelledBy?: string;
  /**
   * 見出しの要素が無い場所用（**省略可**）。`labelledBy` と同じ効果を、
   * **見えない文字をボタンの中に置く**ことで作る（読み上げ名の先頭に足す）。
   * こちらも `aria-label` ではないので、見えている文字は名前に残る。
   */
  label?: string;
};

export function FileDropzone({
  name = "file",
  onSelect,
  flat = false,
  size = "default",
  labelledBy,
  label,
}: Props) {
  // 自分の文字に id を振り、読み上げ名の**末尾**に必ず残るようにする
  const ownTextId = useId();
  const t = useT("files");
  const format = useFormat();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  /** ライトボックスで開いている位置（`previews` の中の位置）。閉じているときは null */
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  /** 画像ごとの実寸。`URL` をキーにする（後述のとおり、これが無いと拡大が効かない） */
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});

  /**
   * 選んだ画像を見せるための一時 URL。
   *
   * 🚨 **描画のたびに `URL.createObjectURL` を呼ばないこと。** 以前はそうなっていて、
   *    再描画のたびに新しい URL が作られ、**どれも解放されないまま溜まっていた**
   *    （選び直すほど増える。画面上は正常に見えるので気づけない）。
   *    ここで一度だけ作り、下の後始末で必ず解放する。
   *
   * 🚨 画像以外（PDF 等）は入れない。**ライトボックスは画像を見るもの**で、
   *    PDF を渡すと開いても真っ白になる。
   */
  const previews = useMemo(
    () =>
      files.flatMap((file, fileIndex) =>
        file.type.startsWith("image/")
          ? [{ url: URL.createObjectURL(file), fileIndex, name: file.name }]
          : [],
      ),
    [files],
  );

  // 作った URL の後始末。選び直したとき（previews が入れ替わったとき）と、
  // この部品が消えるときの両方で、**古い方**を解放する。
  useEffect(
    () => () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
    },
    [previews],
  );

  const accept = (list: FileList | null) => {
    // 🚨 選び直しの途中でやめた（ダイアログを閉じた）ときは**何もしない**。
    // ここで空配列を通すと、外側が「消された」と受け取って既に選ばれているものを捨てる。
    if (!list || list.length === 0) return;
    const next = Array.from(list);
    setFiles(next);
    // 選んだものを実際の input にも載せる（フォームと一緒に送られるのはこちら）
    if (inputRef.current) inputRef.current.files = list;
    onSelect?.(next);
  };

  const remove = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    const dt = new DataTransfer();
    for (const file of next) dt.items.add(file);
    if (inputRef.current) inputRef.current.files = dt.files;
    onSelect?.(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 🚨 **border ではなく outline** で破線を描く。
          `Surface` の中に置くと、4辺の罫線は**面レベル2**として数えられる
          （実測で `pc /admin/files/new` が深さ2になった。design も
           `Attachment` について同じ注意をしている）。
          `outline` は面の判定（罫線・背景・影）のどれでもなく、場所も取らない。
          塗り（bg）で代用すると「親と違う背景」で同じく面に数えられるので、それも避ける。 */}
      <button
        type="button"
        aria-labelledby={labelledBy ? `${labelledBy} ${ownTextId}` : undefined}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-lg px-4 py-6 text-sm outline-1 outline-offset-[-1px] outline-dashed transition-colors",
          size === "logo" ? "min-h-20 w-full max-w-64" : "min-h-32 w-full",
          over
            ? "text-foreground outline-ring"
            : "text-muted-foreground outline-input hover:text-foreground",
        )}
      >
        <UploadCloud className="size-6" />
        {label ? <span className="sr-only">{label}</span> : null}
        <span id={ownTextId}>{over ? t("drop_active") : t("drop_label")}</span>
        <span className="text-xs">{t("drop_hint")}</span>
      </button>

      {/* 🚨 これが本体。見た目に出さない（「ファイル未選択」を出さないため）。
          🚨 **読み上げからも外す。** `name` はフォームの項目名であって読み上げ名ではないので、
          このままだと「名前の無い入力」として読み上げられる。操作は上のボタンが受けており、
          そのボタンは中の文字（「ここにファイルをドロップ」）で名乗れている。
          `aria-hidden` だけだと**焦点は当たるのに読み上げられない**という最悪の形になるので、
          `tabIndex={-1}` を必ず一緒に付けること。 */}
      <input
        ref={inputRef}
        type="file"
        name={name}
        multiple
        aria-hidden
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => accept(event.target.files)}
      />

      {files.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t("selected_count", { count: format.number(files.length) })}
          </p>
          <AttachmentGroup>
            {files.map((file, index) => {
              // この行が画像なら、ライトボックスの何枚目にあたるか（画像以外は -1）
              const previewAt = previews.findIndex((preview) => preview.fileIndex === index);
              const preview = previewAt === -1 ? null : previews[previewAt];
              return (
              <Attachment
                key={`${file.name}-${index}`}
                state="idle"
                // Surface の中では器を持たない（面を2段にしないため。→ flat の説明）
                className={cn(flat && "border-0 bg-transparent")}
              >
                {/* 🚨 画像のレターボックス。背景が要るので面に見えるが、面ではない。
                    例外を検査スクリプト側に隠さず、コードに書いて見えるようにしている
                    （app/(admin)/admin/files/page.tsx:178 と同じ作法） */}
                {/* 🚨 SP では 44px。`AttachmentMedia` の既定は `w-10`（40px）で、
                    その中を `size-full` のボタンが埋めるため **40px の的**になっていた
                    （2026-08-15 実測: [§7 タップ領域（SP）] で 1 件）。
                    🚨 **ボタンだけ大きくしても直らない**——親が `overflow-hidden` なので
                    はみ出した分は**当たり判定ごと切られる**。箱の側を広げる。 */}
                <AttachmentMedia data-surface-exempt className="w-11 sm:w-10">
                  {preview ? (
                    // 押すと大きく見られる。器を持たない（面を増やさない）ので
                    // 見た目はサムネのままで、押せることだけが増える。
                    <button
                      type="button"
                      className="size-full cursor-zoom-in"
                      aria-label={t("open_preview", { name: file.name })}
                      onClick={() => setLightboxAt(previewAt)}
                    >
                      {/* 選んだ直後はまだサーバに無いので、ローカルの URL で見せる */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview.url}
                        alt={file.name}
                        className="size-full object-cover"
                        // 🚨 実寸を控える。**渡さないと拡大が黙って効かない**
                        //    （ボタンは出るが最大倍率が 1 と評価される。エラーも出ない）。
                        //    アップロード済みの画像は DB に寸法があるが、ここはまだ
                        //    ブラウザの中にしか無いので、読み込めた時に測るしかない。
                        onLoad={(event) => {
                          const { naturalWidth, naturalHeight } = event.currentTarget;
                          setSizes((current) =>
                            current[preview.url]
                              ? current
                              : { ...current, [preview.url]: { width: naturalWidth, height: naturalHeight } },
                          );
                        }}
                      />
                    </button>
                  ) : null}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{file.name}</AttachmentTitle>
                </AttachmentContent>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("remove_file")}
                  onClick={() => remove(index)}
                >
                  <X />
                </Button>
              </Attachment>
              );
            })}
          </AttachmentGroup>
          {/* 並べた画像を大きく見る。閉じるまでは何も描かない（開いていないときは null） */}
          {lightboxAt === null ? null : (
            <ImageLightbox
              open
              index={lightboxAt}
              onClose={() => setLightboxAt(null)}
              images={previews.map((preview) => ({
                src: preview.url,
                alt: preview.name,
                ...sizes[preview.url],
              }))}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
