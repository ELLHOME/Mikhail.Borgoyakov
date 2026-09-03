import WorksFly from "./WorksFly";
import { useLang, content } from "../i18n";

export default function Works() {
  const { lang } = useLang();
  const t = content[lang].works;
  return (
    <WorksFly
      id="works"
      eyebrow={t.eyebrow}
      items={t.items}
      introTitle={t.introTitle}
      introText={t.introText}
    />
  );
}
