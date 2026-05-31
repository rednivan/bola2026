import { transporter, FROM } from "@/lib/mailer"
import { unsubscribeUrl } from "./unsubscribe"

type Prediction = { id: string; name: string }

export async function sendKOWindowReminder(
  to: string,
  userId: string,
  predictions: Prediction[],
  knockoutStageStart: Date,
  appUrl: string,
) {
  const deadline = knockoutStageStart.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
  const deadlineTime = knockoutStageStart.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  })

  const predictionLinks = predictions
    .map(
      (p) => `
      <a href="${appUrl}/predictions/${p.id}/edit"
         style="display:block;padding:12px 16px;background:#1A2560;border:1px solid #1E2B6E;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:600;margin-bottom:8px">
        ⚽ ${p.name} — Update KO bracket →
      </a>`
    )
    .join("")

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0D1333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#ffffff">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <div style="text-align:center;padding:32px 0 24px">
      <div style="display:inline-block;background:#E61D25;border-radius:50%;width:48px;height:48px;line-height:48px;text-align:center;font-size:24px;margin-bottom:12px">⚽</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px">Bola 2026</h1>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:14px">KO Bracket Update Window is now open!</p>
    </div>

    <div style="background:#7c2d12;border:1px solid #c2410c;border-radius:12px;padding:20px 24px;margin-bottom:20px;text-align:center">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700">The group stage is over.</p>
      <p style="margin:0;color:#fed7aa;font-size:15px">The real R32 teams are now known — time to update your KO bracket!</p>
    </div>

    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:600">How to update in 3 steps</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
        <tr>
          <td style="width:36px;vertical-align:top;padding-right:12px">
            <div style="background:#E61D25;color:#ffffff;font-weight:700;font-size:13px;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px">1</div>
          </td>
          <td style="vertical-align:top">
            <p style="margin:0;font-weight:600;font-size:14px">Open your prediction below</p>
            <p style="margin:2px 0 0;color:#9ca3af;font-size:13px">Click the link for the prediction you want to update.</p>
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
        <tr>
          <td style="width:36px;vertical-align:top;padding-right:12px">
            <div style="background:#E61D25;color:#ffffff;font-weight:700;font-size:13px;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px">2</div>
          </td>
          <td style="vertical-align:top">
            <p style="margin:0;font-weight:600;font-size:14px">Go to the KO Bracket tab</p>
            <p style="margin:2px 0 0;color:#9ca3af;font-size:13px">The page opens straight on the KO tab. You'll see the real qualified teams in each slot.</p>
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="width:36px;vertical-align:top;padding-right:12px">
            <div style="background:#E61D25;color:#ffffff;font-weight:700;font-size:13px;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px">3</div>
          </td>
          <td style="vertical-align:top">
            <p style="margin:0;font-weight:600;font-size:14px">Pick your winners and save</p>
            <p style="margin:2px 0 0;color:#9ca3af;font-size:13px">Work through R32 → R16 → QF → SF → Final. Winners cascade automatically into the next round.</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;padding:20px 24px;margin-bottom:20px">
      <h2 style="margin:0 0 14px;font-size:15px;font-weight:600">Your predictions</h2>
      ${predictionLinks}
    </div>

    <div style="background:#7f1d1d;border:1px solid #dc2626;border-radius:12px;padding:16px 20px;margin-bottom:20px;text-align:center">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#fca5a5;text-transform:uppercase;letter-spacing:0.5px">Deadline</p>
      <p style="margin:0;font-size:18px;font-weight:700">${deadline}</p>
      <p style="margin:4px 0 0;color:#fca5a5;font-size:13px">${deadlineTime} · When the Round of 32 begins, all KO picks lock permanently.</p>
    </div>

    <div style="background:#0a1028;border:1px solid #1E2B6E;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Scoring reminder</p>
      <table style="border-collapse:collapse;width:100%">
        <tbody>
          <tr>
            <td style="padding:3px 12px 3px 0;font-size:12px;color:#d1d5db;white-space:nowrap">Round of 32</td>
            <td style="padding:3px 12px 3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">3 pts</td>
            <td style="padding:3px 12px 3px 0;font-size:12px;color:#d1d5db;white-space:nowrap">Round of 16</td>
            <td style="padding:3px 12px 3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">6 pts</td>
            <td style="padding:3px 12px 3px 0;font-size:12px;color:#d1d5db;white-space:nowrap">Quarter-final</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">12 pts</td>
          </tr>
          <tr>
            <td style="padding:3px 12px 3px 0;font-size:12px;color:#d1d5db;white-space:nowrap">Semi-final</td>
            <td style="padding:3px 12px 3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">25 pts</td>
            <td style="padding:3px 12px 3px 0;font-size:12px;color:#d1d5db;white-space:nowrap">Final</td>
            <td style="padding:3px 12px 3px 0;font-size:12px;font-weight:700;color:#E61D25;white-space:nowrap">60 pts</td>
            <td colspan="2" style="padding:3px 0;font-size:12px;color:#9ca3af">Joker doubles any correct pick</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p style="text-align:center;color:#9ca3af;font-size:13px;font-style:italic;margin-top:24px;margin-bottom:4px">
      "With great appreciation comes great responsibility"
    </p>
    <p style="text-align:center;color:#4b5563;font-size:12px;margin-top:0;margin-bottom:24px">
      Your friendly neighbourhood code-slinger, now with his buddy, Claude-man.
    </p>

    <p style="text-align:center;color:#4b5563;font-size:12px;margin-top:0">
      Bola 2026 · Good luck! ⚽<br>
      <a href="${appUrl}" style="color:#2A398D">Open Bola 2026</a>
      &nbsp;·&nbsp;
      <a href="${unsubscribeUrl(userId, appUrl)}" style="color:#4b5563">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`

  return transporter.sendMail({
    from: FROM,
    to,
    subject: "Bola 2026 — KO Bracket window is open! Update your picks now ⚽",
    html,
  })
}
