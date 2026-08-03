/**
 * Cross-device: Supabase DB (evisa_records).
 * Dynamic import use karte hain taake har device par Supabase load ho – data sab jagah dikhe.
 */
(function () {
  'use strict';
  var config = window.EvisaSupabaseConfig;
  if (!config || !config.url || !config.anonKey) {
    window.EvisaCloudReady = Promise.resolve(false);
    return;
  }

  var TABLE = 'evisa_records';

  function norm(s) {
    return String(s || '').trim();
  }
  function normalizeForLookup(s) {
    return norm(s).toLowerCase().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
  }

  function toRow(r, prev) {
    var item = {
      passport_number: norm(r.passportNumber || r.passport_number),
      visa_number: norm(r.visaNumber || r.visa_number),
      application_code: norm(r.applicationCode || r.application_code),
      status: norm(r.status),
      buffered: r.hasOwnProperty('buffered') ? !!r.buffered : (prev && !!prev.buffered)
    };
    if (r.pdfDataUrl !== undefined && r.pdfDataUrl !== null) item.pdf_data_url = r.pdfDataUrl;
    else if (r.pdf_data_url !== undefined) item.pdf_data_url = r.pdf_data_url;
    else if (prev && (prev.pdfDataUrl || prev.pdf_data_url)) item.pdf_data_url = prev.pdfDataUrl || prev.pdf_data_url;
    return item;
  }

  function fromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      passportNumber: row.passport_number || '',
      visaNumber: row.visa_number || '',
      applicationCode: row.application_code || '',
      status: row.status || '',
      pdfDataUrl: row.pdf_data_url || null,
      buffered: !!row.buffered
    };
  }

  window.EvisaCloudReady = (window.EvisaSupabaseReady || import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(function (m) {
    return m.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  })).then(function (supabase) {
    if (!supabase) throw new Error('No Supabase client');
    window.EvisaSupabase = supabase;
    window.EvisaUseCloud = true;

    window.getEvisaAdminRecordsAsync = function () {
      return supabase.from(TABLE).select('*').order('created_at', { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          return (res.data || []).map(fromRow);
        });
    };

    window.addEvisaAdminRecordAsync = function (r) {
      var row = toRow(r, null);
      return supabase.from(TABLE).insert(row).then(function (res) {
        if (res.error) throw res.error;
        return res;
      });
    };

    window.updateEvisaAdminRecordAtAsync = function (index, r) {
      return window.getEvisaAdminRecordsAsync().then(function (rows) {
        if (index < 0 || index >= rows.length) return;
        var prev = rows[index];
        var id = prev.id;
        if (!id) throw new Error('No id');
        var row = toRow(r, prev);
        return supabase.from(TABLE).update(row).eq('id', id).then(function (res) {
          if (res.error) throw res.error;
          return res;
        });
      });
    };

    window.removeEvisaAdminRecordAtAsync = function (index) {
      return window.getEvisaAdminRecordsAsync().then(function (rows) {
        if (index < 0 || index >= rows.length) return;
        var id = rows[index].id;
        if (!id) throw new Error('No id');
        return supabase.from(TABLE).delete().eq('id', id).then(function (res) {
          if (res.error) throw res.error;
          return res;
        });
      });
    };

    window.toggleEvisaBufferedAtAsync = function (index) {
      return window.getEvisaAdminRecordsAsync().then(function (rows) {
        if (index < 0 || index >= rows.length) return;
        var prev = rows[index];
        var id = prev.id;
        if (!id) throw new Error('No id');
        var next = {
          passportNumber: prev.passportNumber,
          visaNumber: prev.visaNumber,
          applicationCode: prev.applicationCode,
          status: prev.status,
          buffered: !prev.buffered
        };
        if (prev.pdfDataUrl) next.pdfDataUrl = prev.pdfDataUrl;
        var row = toRow(next, prev);
        return supabase.from(TABLE).update(row).eq('id', id).then(function (res) {
          if (res.error) throw res.error;
          return res;
        });
      });
    };

    window.findEvisaByApplicationCodeAsync = function (code) {
      var c = normalizeForLookup(code);
      if (!c) return Promise.resolve(undefined);
      return supabase.from(TABLE).select('*').eq('buffered', false).then(function (res) {
        if (res.error) throw res.error;
        var list = (res.data || []).map(fromRow);
        return list.find(function (x) {
          return normalizeForLookup(x.applicationCode) === c;
        });
      });
    };

    window.findEvisaByPassportVisaAsync = function (passport, visa) {
      var p = normalizeForLookup(passport);
      var v = normalizeForLookup(visa);
      if (!p || !v) return Promise.resolve(undefined);
      return supabase.from(TABLE).select('*').eq('buffered', false).then(function (res) {
        if (res.error) throw res.error;
        var list = (res.data || []).map(fromRow);
        return list.find(function (x) {
          return normalizeForLookup(x.passportNumber) === p && normalizeForLookup(x.visaNumber) === v;
        });
      });
    };

    return true;
  }).catch(function (e) {
    console.warn('Evisa Supabase cloud init failed', e);
    return false;
  });
})();
