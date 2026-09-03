import LabProcess from "./LabProcess";
import { useLang, content } from "../i18n";

export default function Lab() {
  const { lang } = useLang();
  const t = content[lang].lab;
  return (
    <LabProcess
      id="lab"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      items={t.items}
      stats={t.stats}
      contrib={t.contrib}
    />
  );
}
