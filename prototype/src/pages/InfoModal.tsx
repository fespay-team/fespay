import { useRef } from "react";
import {
  Bell,
  CalendarDays,
  Info,
  MapPin,
  Megaphone,
  ScanLine,
  Store,
  X,
} from "lucide-react";
import festivalStalls480 from "../assets/festival-stalls-480.jpg";
import festivalStalls960 from "../assets/festival-stalls-960.jpg";
import { useDialogFocus } from "../hooks/useDialogFocus";

export type Modal =
  "stores" | "event" | "notice" | "notifications" | "scan" | "reset";

const modalLabels: Record<Modal, string> = {
  stores: "出店一覧",
  event: "イベント詳細",
  notice: "お知らせ",
  notifications: "通知",
  scan: "QRをスキャンする",
  reset: "デモデータの初期化",
};

type InfoModalProps = {
  modal: Modal;
  onClose: () => void;
  onOpenStores: () => void;
  onReset: () => void;
};

export default function InfoModal({
  modal,
  onClose,
  onOpenStores,
  onReset,
}: InfoModalProps) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);

  useDialogFocus({
    overlayRef: backdropRef,
    panelRef: modalRef,
    focusKey: modal,
    focusSelector: ".modal-close",
    onClose,
  });

  return (
    <div
      className="modal-backdrop"
      ref={backdropRef}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <section
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={modalLabels[modal]}
        tabIndex={-1}
        ref={modalRef}
      >
        <div className="modal-handle" />
        <button
          className="modal-close"
          type="button"
          onClick={() => onClose()}
          aria-label="閉じる"
        >
          <X size={20} />
        </button>
        {modal === "stores" && (
          <>
            <span className="modal-icon orange">
              <Store size={25} />
            </span>
            <h2>出店一覧</h2>
            <p>サンプルイベントの出店イメージです。</p>
            <div className="modal-list">
              <div>
                <span>🍙</span>
                <strong>からあげ屋台</strong>
                <small>フードエリア A-01</small>
              </div>
              <div>
                <span>🥤</span>
                <strong>青空ドリンク</strong>
                <small>フードエリア A-02</small>
              </div>
              <div>
                <span>🎨</span>
                <strong>手づくり雑貨</strong>
                <small>マーケット B-03</small>
              </div>
            </div>
          </>
        )}
        {modal === "event" && (
          <>
            <span className="modal-icon mint">
              <CalendarDays size={25} />
            </span>
            <h2>みどりの森まつり 2026</h2>
            <p>
              イベント情報の表示サンプルです。開催内容・日程・会場は仮のデータです。
            </p>
            <div className="event-modal-image">
              <img
                src={festivalStalls480}
                srcSet={
                  festivalStalls480 + " 480w, " + festivalStalls960 + " 960w"
                }
                sizes="(max-width: 460px) calc(100vw - 56px), 404px"
                decoding="async"
                alt="学園祭や地域のお祭りの屋台と来場者のイメージ"
              />
            </div>
            <div className="modal-detail">
              <CalendarDays size={18} /> 2026年10月9日（金）– 10日（土）
            </div>
            <div className="modal-detail">
              <MapPin size={18} /> みどりの森広場
            </div>
          </>
        )}
        {modal === "notice" && (
          <>
            <span className="modal-icon purple">
              <Megaphone size={25} />
            </span>
            <h2>お知らせ</h2>
            <p>サンプルイベントの出店情報を更新しました！</p>
            <div className="notice-detail">
              屋台や手づくり雑貨など、会場の出店イメージを見られます。
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => onOpenStores()}
            >
              出店一覧を見る
            </button>
          </>
        )}
        {modal === "scan" && (
          <>
            <span className="modal-icon mint">
              <ScanLine size={25} />
            </span>
            <h2>QRをスキャンする</h2>
            <p>お店のQRを読み取る画面です。</p>
            <div className="scan-demo" aria-label="QRスキャンのデモ画面">
              <span className="scan-demo-frame">
                <ScanLine size={54} />
              </span>
              <strong>スキャン画面（デモ）</strong>
            </div>
            <div className="notice-detail">
              このプロトタイプでは、カメラでの読み取りと決済はまだ利用できません。
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => onClose()}
            >
              支払い画面に戻る
            </button>
          </>
        )}
        {modal === "notifications" && (
          <>
            <span className="modal-icon purple">
              <Bell size={25} />
            </span>
            <h2>お知らせ</h2>
            <p>出店情報を更新しました！</p>
            <div className="notice-detail">
              ホーム画面のイベント・出店・お知らせはサンプル表示です。
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => onOpenStores()}
            >
              出店一覧を見る
            </button>
          </>
        )}
        {modal === "reset" && (
          <>
            <span className="modal-icon purple">
              <Info size={25} />
            </span>
            <h2>デモデータを初期化</h2>
            <p>
              このブラウザーに保存したデモ残高と取引履歴を最初の状態に戻します。
            </p>
            <div className="reset-actions">
              <button type="button" onClick={() => onClose()}>
                やめる
              </button>
              <button type="button" onClick={() => void onReset()}>
                初期化する
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
