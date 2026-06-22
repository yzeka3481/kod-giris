function renderReportContent() {
                // Tamamlanmış seyahatlerin isimlerini al
                const completedTripNames = (state.trips || []).filter(t => t.status === 'completed').map(t => t.name);

                // Sadece aktif olan (tamamlanmamış) seyahatleri listele
                const allTrips = [...new Set([
                    ...(state.trips || []).filter(t => t.status !== 'completed').map(t => t.name),
                    ...state.exp.map(x => x.trip).filter(t => !completedTripNames.includes(t)),
                    ...state.res.map(x => x.trip).filter(t => !completedTripNames.includes(t)),
                    ...(state.transfers || []).map(x => x.trip).filter(t => !completedTripNames.includes(t))
                ].filter(Boolean))].sort();

                let selectedTrip = state.selectedReportTrip;

                // Eğer seçili seyahat tamamlanmışlar arasındaysa veya listede yoksa ilk aktif seyahati seç
                if (!allTrips.includes(selectedTrip) || completedTripNames.includes(selectedTrip)) {
                    selectedTrip = allTrips[0] || 'Genel';
                    state.selectedReportTrip = selectedTrip;
                }

                const tripExpenses = getTripExpenses(selectedTrip);

                const tripOptions = allTrips.map(t => `<option value="${esc(t)}" ${selectedTrip === t ? 'selected' : ''}>${esc(t)}</option>`).join('');

                const reportCur = state.reportCurrency;
                const currencyOptions = AVAILABLE_CURRENCIES.map(c =>
                    `<option value="${c}" ${c === reportCur ? 'selected' : ''}>${c}</option>`
                ).join('');

                const pdfCat = (state.reportPdfCat || '').trim();
                const normCat = (v) => String(v || '').trim();
                const hasUncat = tripExpenses.some(x => !normCat(x.cat));
                const catLabel = (id) => {
                    const key = normCat(id);
                    if (!key) return '';
                    try {
                        if (typeof CATS === 'object' && CATS) {
                            if (CATS[key] && CATS[key].l) return CATS[key].l;
                            const hit = Object.values(CATS).find(x => x && x.id === key);
                            if (hit && hit.l) return hit.l;
                        }
                    } catch (e) { }
                    return key;
                };

                const allCats = [...new Set(tripExpenses.map(x => normCat(x.cat)).filter(Boolean))]
                    .sort((a, b) => catLabel(a).localeCompare(catLabel(b), 'tr', { sensitivity: 'base' }));

                const pdfCatLabel = pdfCat
                    ? (pdfCat === '__uncat__' ? 'Kategorisiz' : catLabel(pdfCat))
                    : 'Tümü';

                const pdfCatOptions = [
                    `<option value="" ${pdfCat === '' ? 'selected' : ''}>Tümü</option>`,
                    ...(hasUncat ? [`<option value="__uncat__" ${pdfCat === '__uncat__' ? 'selected' : ''}>Kategorisiz</option>`] : []),
                    ...allCats.map(c => `<option value="${esc(c)}" ${pdfCat === c ? 'selected' : ''}>${esc(catLabel(c))}</option>`)
                ].join('');


                if (!tripExpenses.length) {
                    return `
                <div class="space-y-4 pt-3">
                  <!-- SEYAHAT SEÇİMİ -->
                  <div>
                     <label class="block text-xs font-bold text-slate-500 mb-1 uppercase">Raporlanacak Seyahat Seçimi</label>
                     <div class="relative">
                       <select
                       data-act="set-report-trip"
                       class="w-full bg-slate-950/50 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-white cursor-pointer backdrop-blur-sm">

                         ${tripOptions}
                       </select>
                     </div>
                  </div>
                  <div class="text-center py-6 bg-slate-900/50 border border-slate-700 rounded-xl text-slate-400 text-sm">
                      <div class="mb-2 text-2xl">📝</div>
                      Seçilen seyahat için harcama kaydı bulunmamaktadır.
                  </div>
              </div>
                `;
                }

                let totalInReportCur = 0;
                tripExpenses.forEach(x => {
                    totalInReportCur += convertToBase(x.amt, x.cur, reportCur);
                });

                const totalsByCurrency = {};
                tripExpenses.forEach(x => {
                    const cur = x.cur || BASE_CURRENCY;
                    const amt = Number(x.amt) || 0;
                    totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + amt;
                });
                const originalSummary = Object.entries(totalsByCurrency)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cur, amt]) => `<span class="bg-violet-700/50 px-3 py-1 rounded-full text-sm font-bold">${fmtNum(amt)} <span class="text-xs font-normal">${cur}</span></span>`)
                    .join('');

                const categoryDataReport = {};
                tripExpenses.forEach(x => {
                    const cat = x.cat || 'other';
                    const amtInReportCur = convertToBase(x.amt, x.cur, reportCur);
                    categoryDataReport[cat] = (categoryDataReport[cat] || 0) + amtInReportCur;
                });

                const topCategories = Object.entries(categoryDataReport)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([catId, amt], index) => {
                        const catInfo = CATS[catId] || CATS.other;
                        return `
                <div class="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 bg-slate-800/50">
                      <span class="text-sm font-medium text-slate-200 flex items-center gap-2">
                          ${catInfo.i} ${esc(catInfo.l)}
                      </span>
                      <span class="font-bold text-white">${fmtNum(amt)} ${reportCur}</span>
                  </div>
                `;
                    }).join('');

                const cityPlaceTotals = {};
                tripExpenses.forEach(x => {
                    const key = `${x.city} / ${x.place}`;
                    const amtInReportCur = convertToBase(x.amt, x.cur, reportCur);
                    cityPlaceTotals[key] = (cityPlaceTotals[key] || 0) + amtInReportCur;
                });
                const topLocations = Object.entries(cityPlaceTotals)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([key, amt], index) => {
                        const [city, place] = key.split(' / ');
                        return `
                  <div class="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 bg-slate-800/50">
                      <span class="text-sm font-medium text-slate-200">
                          <span class="font-bold text-white">${esc(place)}</span> <span class="text-slate-400">(${esc(city)})</span>
                      </span>
                      <span class="font-bold text-white">${fmtNum(amt)} ${reportCur}</span> 
                  </div>
              `;
                    }).join('');

                const allImages = tripExpenses
                    .flatMap(x => x.imgs || [])
                    .filter(Boolean);

                const uniqueImages = [...new Set(allImages)].slice(0, 10);

                const imagePreview = uniqueImages.length > 0 ? `
          <div class="grid grid-cols-5 gap-2">
              ${uniqueImages.map(img => `
                  <div class="aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-800">
                      <img src="${img}" data-act="lb" class="w-full h-full object-cover cursor-zoom-in hover:scale-110 transition duration-300">
                  </div>
              `).join('')}
          </div>
      ` : '<p class="text-sm text-slate-500 italic">Bu seyahatte eklenmiş fotoğraf bulunmamaktadır.</p>';

                const notesForTrip = state.criticalNotes
                    .filter(n => n.trip === selectedTrip)
                    .map(n => `<li class="text-sm text-slate-300 list-disc ml-4">${esc(n.note)}</li>`).join('');

                // BORÇ HESAPLAMA VE HTML OLUŞTURMA
                const debtInfo = calculateDebts(selectedTrip);
                let debtHtml = '';


                // TRANSFER (Mahsuplaşma) Bölümü
                let transferSectionHtml = '';
                try {
                    const tripObjForTransfers = (state.trips || []).find(t => t.name === selectedTrip);
                    const personsForTransfers = (tripObjForTransfers && tripObjForTransfers.persons)
                        ? tripObjForTransfers.persons.split(',').map(p => p.trim()).filter(Boolean)
                        : [];
                    if (personsForTransfers.length >= 2) {
                        const transfersForTrip = (state.transfers || []).filter(t => t && t.trip === selectedTrip);
                        transfersForTrip.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

                        const personOpts = personsForTransfers.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
                        const curOpts = AVAILABLE_CURRENCIES.map(c => `<option value="${c}" ${c === reportCur ? 'selected' : ''}>${c}</option>`).join('');

                        const transferRows = transfersForTrip.length
                            ? transfersForTrip.map(tr => `
                                <div class="flex items-center justify-between bg-slate-900/60 border border-slate-700/50 rounded-lg p-3">
                                    <div class="min-w-0">
                                        <div class="text-sm text-white font-semibold truncate">
                                            ${esc(tr.from || '')} <span class="text-slate-400 mx-1">→</span> ${esc(tr.to || '')}
                                            <span class="text-slate-400 mx-2">•</span>
                                            <span class="text-white font-mono text-sm">${fmtNum(convertToBase(Number(tr.amt)||0, tr.cur || reportCur, reportCur))} ${esc(reportCur)}</span>
                                        </div></div>
                                    <button data-act="del-transfer" data-id="${esc(tr.id)}" class="ml-3 shrink-0 px-3 py-2 rounded-lg bg-red-600/30 hover:bg-red-600/50 border border-red-500/30 text-red-100 text-xs font-bold">Sil</button>
                                </div>
                            `).join('')
                            : `<div class="text-sm text-slate-400 bg-slate-900/40 p-3 rounded-lg border border-slate-700/40">Henüz mahsuplaşma kaydı yok.</div>`;

                        transferSectionHtml = `
                            <div class="bg-gradient-to-br from-emerald-900/20 via-slate-800/40 to-teal-900/20 border border-emerald-500/20 rounded-xl p-5 space-y-4 shadow-lg">
                                <h4 class="text-base font-bold text-white uppercase flex items-center gap-2">
                                    <span class="text-2xl">🔁</span> Yapılan Mahsuplaşmalar (Transferler)
                                </h4>

                                <div class="space-y-2">
                                    ${transferRows}
                                </div>

                                <div class="pt-3 border-t border-slate-700/40">
                                    <h5 class="text-xs font-bold text-slate-300 uppercase mb-2">Yeni Mahsuplaşma Ekle</h5>
                                    <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
                                        <div class="md:col-span-2">
                                            <label class="block text-[11px] text-slate-500 mb-1">Gönderen</label>
                                            <select id="trf-from" class="w-full bg-slate-950/50 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-white">${personOpts}</select>
                                        </div>
                                        <div class="md:col-span-2">
                                            <label class="block text-[11px] text-slate-500 mb-1">Alan</label>
                                            <select id="trf-to" class="w-full bg-slate-950/50 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-white">${personOpts}</select>
                                        </div>
                                        <div class="md:col-span-1">
                                            <label class="block text-[11px] text-slate-500 mb-1">Tutar</label>
                                            <input id="trf-amt" inputmode="decimal" placeholder="0" class="w-full bg-slate-950/50 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-white"/>
                                        </div>
                                        <div class="md:col-span-1">
                                            <label class="block text-[11px] text-slate-500 mb-1">Para Birimi</label>
                                            <select id="trf-cur" class="w-full bg-slate-950/50 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-white">${curOpts}</select>
                                        </div>
<div class="md:col-span-6 flex justify-end">
                                            <button data-act="add-transfer" class="mt-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">Ekle</button>
                                        </div>
                                    </div>
                                    <div class="text-[11px] text-slate-500 mt-2">
                                        Not: Transferler kişi başı harcamayı değiştirmez; sadece kim-kime bakiyesini (kalan ödemeleri) günceller.
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                } catch (err) { console.error(err); }

                if (debtInfo && debtInfo.transactions.length > 0) {
                    const debtRows = debtInfo.transactions.map(t => `
                <div class="flex items-center gap-3 bg-gradient-to-r from-slate-800/80 to-slate-700/60 p-3 rounded-lg border border-slate-600/40 hover:border-slate-500/60 transition">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-red-300 font-bold max-w-[180px] truncate text-sm">${esc(t.from)}</span>
                        <span class="text-slate-400 shrink-0 flex items-center justify-center">
                            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                            </svg>
                        </span>
                        <span class="text-emerald-300 font-bold max-w-[180px] truncate text-sm">${esc(t.to)}</span>
                    </div>
                    <span class="ml-auto font-bold text-white shrink-0 bg-blue-600/30 px-3 py-1.5 rounded-lg text-sm font-mono">${fmtNum(t.amount)} ${debtInfo.currency}</span>
                </div>

             `).join('');

                    // YENİ: Kişi Bazlı Ödeme Özeti
                    const personSummaryRows = debtInfo.persons.map(person => {
                        const paid = debtInfo.personPayments[person] || 0;
                        const share = (debtInfo.sharePerPersonForSettlement ?? debtInfo.sharePerPerson);
                        const balanceBefore = paid - share;
                        const balance = (debtInfo.balancesAfterTransfers && typeof debtInfo.balancesAfterTransfers[person] === 'number')
                            ? debtInfo.balancesAfterTransfers[person]
                            : balanceBefore;
                        const isCreditor = balance > 0.01;
                        const isDebtor = balance < -0.01;
                        const statusText = isCreditor ? 'Alacaklı' : isDebtor ? 'Borçlu' : 'Dengede';
                        const statusColor = isCreditor ? 'text-emerald-400' : isDebtor ? 'text-red-400' : 'text-slate-400';
                        const personBreakdown = (debtInfo.breakdown && debtInfo.breakdown[person]) ? debtInfo.breakdown[person] : [];
                        const breakdownHtml = personBreakdown.length > 0 ? `
                            <div class="mt-2 pt-2 border-t border-slate-700/50 space-y-1">
                                <div class="text-[9px] font-bold text-slate-500 uppercase mb-1">Paylaştığı Harcamalar:</div>
                                ${personBreakdown.map(b => `
                                    <div class="flex justify-between items-center text-[10px]">
                                        <span class="text-slate-300 truncate mr-2">${b.isRes ? '🏨 ' : ''}${esc(b.name)}</span>
                                        <span class="text-slate-400 font-mono whitespace-nowrap">${fmtNum(b.amt)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '';

                        return `
                <div class="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40 hover:border-slate-600/60 transition">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-white font-bold text-sm">${esc(person)}</span>
                        <span class="${statusColor} text-xs font-semibold">${statusText}</span>
                    </div>
                    <div class="space-y-1 text-xs">
                        <div class="flex justify-between">
                            <span class="text-slate-400">Ödediği:</span>
                            <span class="text-white font-mono">${fmtNum(paid)} ${debtInfo.currency}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-400">Payı:</span>
                            <span class="text-slate-300 font-mono">${fmtNum(share)} ${debtInfo.currency}</span>
                        </div>
                    </div>
                    ${breakdownHtml}
                </div>
            `;
                    }).join('');

                    debtHtml = `
            <!-- Kişi Bazlı Ödeme Özeti (YENİ) -->
            <div class="bg-gradient-to-br from-indigo-900/30 via-slate-800/50 to-cyan-900/30 border border-indigo-500/30 rounded-xl p-5 space-y-4 shadow-lg">
                <h4 class="text-base font-bold text-white uppercase flex items-center gap-2">
                   <span class="text-2xl">👥</span> Kişi Bazlı Ödeme Özeti
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${personSummaryRows}
                </div>
            </div>

            <!-- Borç Dağılımı (YENİ) -->
            <div class="bg-gradient-to-br from-purple-900/30 via-slate-800/50 to-blue-900/30 border border-purple-500/30 rounded-xl p-5 space-y-4 shadow-lg">
                <h4 class="text-base font-bold text-white uppercase flex items-center gap-2">
                   <span class="text-2xl">💰</span> Kim Kime Ne Kadar Verecek?
                </h4>
                <div class="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50 space-y-2">
                    <div class="flex justify-between text-xs">
                        <span class="text-slate-400">Toplam Ortak Harcama:</span> 
                        <span class="text-white font-bold font-mono">${fmtNum(debtInfo.totalShared)} ${debtInfo.currency}</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-slate-400">Kişi Başı Düşen Pay:</span> 
                        <span class="text-emerald-400 font-bold font-mono">${fmtNum(debtInfo.sharePerPerson)} ${debtInfo.currency}</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span class="text-slate-400">Mahsuplaşmaya Dahil Kişi Payı:</span> 
                        <span class="text-amber-300 font-bold">${fmtNum(debtInfo.sharePerPersonForSettlement || 0)} ${debtInfo.currency}</span>
                    </div>
                </div>
                <div class="space-y-2">
                    ${debtRows}
                </div>
                <div class="text-xs text-slate-400 bg-slate-900/40 p-2 rounded border border-slate-700/30">
                    <span class="text-red-300 font-semibold">●</span> Borçlu (ödeyecek) 
                    <span class="mx-2">→</span>
                    <span class="text-emerald-300 font-semibold">●</span> Alacaklı (alacak)
                </div>
            </div>
             `;
                } else if (debtInfo) {
                    // Hesaplaşılacak bir durum yoksa ama seyahat 'kişili' ise yine de gösterebiliriz veya boş geçebiliriz.
                    // Boş geçelim.
                }

                return `
          <div class="space-y-4 pt-3">
              
              <!-- SEYAHAT SEÇİMİ VE RAPOR PARA BİRİMİ (YANYANA) -->
              <div class="grid grid-cols-2 gap-3">
                  <div>
                     <label class="block text-xs font-bold text-slate-500 mb-1 uppercase">Seyahat</label>
                     <div class="relative">
                       <select data-act="set-report-trip" class="w-full bg-slate-950/50 border border-white/30 rounded-lg py-2 px-3 pr-8 text-sm text-white outline-none focus:border-white appearance-none cursor-pointer backdrop-blur-sm">
                         ${tripOptions}
                       </select>
                       <div class="absolute right-3 top-2.5 text-white pointer-events-none">${ICONS.down.replace('w-4 h-4', 'w-3.5 h-3.5')}</div>
                     </div>
                  </div>
                  <!-- YENİ: RAPOR PARA BİRİMİ SEÇİMİ -->
                  <div>
                     <label class="block text-xs font-bold text-slate-500 mb-1 uppercase">Rapor Para Birimi</label>
                     <div class="relative">
                       <select data-act="set-report-currency" class="w-full bg-slate-950/50 border border-white/30 rounded-lg py-2 px-3 pr-8 text-sm text-white outline-none focus:border-white appearance-none cursor-pointer backdrop-blur-sm">
                         ${currencyOptions}
                       </select>
                       <div class="absolute right-3 top-2.5 text-white pointer-events-none">${ICONS.down.replace('w-4 h-4', 'w-3.5 h-3.5')}</div>
                     </div>
                  </div>

                  <!-- YENİ: PDF KATEGORİ FİLTRESİ -->
                  <div>
                     <label class="block text-xs font-bold text-slate-500 mb-1 uppercase">PDF Kategori Filtresi</label>
                     <div class="relative">
                       <select data-act="set-report-pdf-cat" class="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white appearance-none cursor-pointer backdrop-blur-sm">
                         ${pdfCatOptions}
                       </select>
                       <div class="absolute right-3 top-2.5 text-white pointer-events-none">${ICONS.down.replace('w-4 h-4', 'w-3.5 h-3.5')}</div>
                     </div>
                     <div class="text-[10px] text-slate-400 mt-1">PDF çıktısında yalnızca seçili kategori yer alır.</div>
                  </div>
              </div>


              <div class="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-700/50 rounded-xl p-4">
                  <h3 class="text-lg font-bold text-white mb-2">${selectedTrip} Seyahat Özeti</h3>
                  <div class="text-[10px] text-slate-400">Toplam Harcama: <span class="font-bold text-white">${fmtNum(totalInReportCur)} ${reportCur}</span>'a dönüştürülmüştür. (${tripExpenses.length} kayıt)</div>
              </div>
              <div class="flex items-center gap-2 text-[11px] text-slate-200">
                <span>Bu seyahatin detaylı harcama dökümünü (Kategori: <strong>${esc(pdfCatLabel)}</strong>) PDF olarak</span>
                <button
                  type="button"
                  data-act="export-pdf" data-auth="required"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-900 font-semibold text-[11px] shadow-sm hover:bg-white transition"
                >
                  ${ICONS.report.replace('w-4 h-4', 'w-3.5 h-3.5')}
                  <span>buradan indirebilirsiniz</span>
                </button>
              </div>

              <!-- BORÇ / HESAPLAŞMA BÖLÜMÜ (En üste yakın) -->
              ${debtHtml}

          ${transferSectionHtml}
              <!-- 1. Toplam Harcama (Orijinal Kurlar) -->
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                  <h4 class="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
                     ${ICONS.wallet.replace('w-4 h-4', 'w-4 h-4')} Orijinal Para Birimi Bazında Toplam Harcama
                  </h4>
                  <div class="flex flex-wrap gap-2">
                      ${originalSummary || '<span class="text-slate-500">Harcama Yok</span>'}
                  </div>
              </div>

              <!-- 2. En Çok Harcama Yapılan 3 Kategori -->
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                  <h4 class="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
                     ${ICONS.chart.replace('w-4 h-4', 'w-4 h-4')} En Çok Harcanan Kategoriler (${reportCur})
                  </h4>
                  <div class="space-y-2">
                    ${topCategories || '<p class="text-sm text-slate-500 italic">Kategori harcaması bulunamadı.</p>'}
                  </div>
              </div>

              <!-- 3. En Çok Para Bırakılan 3 Şehir/Mekan -->
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                  <h4 class="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
                     ${ICONS.location.replace('w-4 h-4', 'w-4 h-4')} En Çok Para Bırakılan 3 Mekan (${reportCur})
                  </h4>
                  <div class="space-y-2">
                    ${topLocations || '<p class="text-sm text-slate-500 italic">Mekan harcaması bulunamadı.</p>'}
                  </div>
              </div>

              <!-- 5. Notlar -->
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                  <h4 class="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
                     ${ICONS.key.replace('w-4 h-4', 'w-4 h-4')} Kritik Seyahat Notları
                  </h4>
                  <ul class="list-none space-y-1 p-0 m-0">
                      ${notesForTrip || '<p class="text-sm text-slate-500 italic">Bu seyahat için kritik not bulunmamaktadır.</p>'}
                  </ul>
              </div>

              <!-- 4. Fotoğraf Önizlemesi -->
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                  <h4 class="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
                     📸 Eklenen Fotoğraflar (İlk 10)
                  </h4>
                  ${imagePreview}
              </div>
              
              <!-- YENİ: RAPOR NOTLARI VE AÇIKLAMALAR -->
              <div class="bg-gradient-to-br from-amber-900/20 via-slate-800/50 to-orange-900/20 border border-amber-600/30 rounded-xl p-5 space-y-3">
                  <h4 class="text-base font-bold text-amber-200 uppercase flex items-center gap-2">
                     📋 Rapor Hakkında Bilinmesi Gerekenler
                  </h4>
                                       
                      <div class="bg-slate-900/40 p-3 rounded-lg border border-slate-700/40">
                          <div class="font-semibold text-emerald-300 mb-1.5">👥 Borç Hesaplama Mantığı</div>
                          <p class="leading-relaxed">Borç hesaplaması sadece "Ortak" olarak işaretlenmiş harcamalar ve rezervasyonlar için yapılır. "Ödendi/Settled" işaretli rezervasyonlar toplam maliyete ve kişi başı paya dahil edilir ancak borç hesaplamasına dahil edilmez (çünkü zaten ödenmiş ve mahsuplaşılmıştır). Sistem, her kişinin ödediği toplam tutarı hesaplar ve kişi başına düşen payı belirler. Fazla ödeyenler alacaklı, az ödeyenler borçlu olarak listelenir. Hesaplama algoritması minimum işlem sayısıyla dengeyi sağlamayı hedefler.</p>
                      </div>
                      
                      <div class="bg-slate-900/40 p-3 rounded-lg border border-slate-700/40">
                          <div class="font-semibold text-blue-300 mb-1.5">📊 Kategori ve Mekan Sıralaması</div>
                          <p class="leading-relaxed">En çok harcanan kategoriler ve mekanlar, seçilen rapor para birimine dönüştürülmüş tutarlara göre sıralanmaktadır. Sadece ilk 3 sıra gösterilir. Birden fazla para birimi kullanıldıysa, tüm tutarlar rapor para birimine çevrilerek karşılaştırılır.</p>
                      </div>
                      
                      <div class="bg-slate-900/40 p-3 rounded-lg border border-slate-700/40">
                          <div class="font-semibold text-purple-300 mb-1.5">🔍 Bireysel ve Ortak Harcamalar</div>
                          <p class="leading-relaxed">Harcamalar "Bireysel" veya "Ortak" olarak işaretlenebilir. Bireysel harcamalar sadece ilgili kişiye ait olup borç hesaplamasına dahil edilmez. Ortak harcamalar tüm seyahat katılımcıları arasında eşit olarak paylaştırılır ve borç hesaplamasında kullanılır.</p>
                      </div>
                      
                      <div class="bg-slate-900/40 p-3 rounded-lg border border-slate-700/40">
                          <div class="font-semibold text-rose-300 mb-1.5">⚠️ Önemli Uyarılar</div>
                          <p class="leading-relaxed">• Rezervasyon maliyetleri de ortak harcamalara dahil edilir.<br/>
                          • Kur bilgileri uygulamada kayıtlı verilerden alınır, güncel piyasa kurlarından farklılık gösterebilir.<br/>
                          • PDF dökümü için giriş yapmanız gerekmektedir.<br/>
                          • Rapor verileri anlık olarak hesaplanır ve değişiklikler otomatik yansıtılır.</p>
                      </div>
                  </div>
              </div>
          </div>
      `;
            }