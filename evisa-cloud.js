/**
 * Secure Supabase data access for admin, tracking and verification flows.
 * Public pages use exact-match RPC functions; the records table is never
 * directly readable by anonymous visitors.
 */
(function () {
  'use strict';

  var config = window.EvisaSupabaseConfig;
  var TABLE = 'evisa_records';

  function norm(value) {
    return String(value || '').trim();
  }

  function fromRow(row) {
    if (!row) return null;
    return {
      id: row.id || null,
      passportNumber: row.passport_number || row.masked_passport_number || '',
      visaNumber: row.visa_number || row.masked_visa_number || '',
      applicationCode: row.application_code || '',
      status: row.status || '',
      hasPdf: !!row.has_pdf,
      buffered: !!row.buffered,
      createdAt: row.created_at || null
    };
  }

  function toRow(record) {
    var row = {
      passport_number: norm(record.passportNumber),
      visa_number: norm(record.visaNumber),
      application_code: norm(record.applicationCode),
      status: norm(record.status),
      buffered: !!record.buffered
    };
    if (record.pdfDataUrl !== undefined) row.pdf_data_url = record.pdfDataUrl || null;
    return row;
  }

  function firstRpcRow(result) {
    if (result.error) throw result.error;
    if (Array.isArray(result.data)) return fromRow(result.data[0]);
    return fromRow(result.data);
  }

  window.statusBadgeClass = function (status) {
    var value = norm(status).toLowerCase();
    if (value === 'approved') return 'bg-green-100 text-green-800';
    if (value === 'pending') return 'bg-yellow-100 text-yellow-800';
    if (value === 'rejected' || value === 'reject') return 'bg-red-100 text-red-800';
    if (value.indexOf('review') >= 0) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (!config || !config.url || !config.anonKey) {
    window.EvisaCloudReady = Promise.resolve(false);
    return;
  }

  window.EvisaCloudReady = (window.EvisaSupabaseReady || Promise.resolve(null)).then(function (supabase) {
    if (!supabase) throw new Error('Supabase client is unavailable.');
    window.EvisaSupabase = supabase;

    window.isEvisaAdminAsync = function () {
      return supabase.rpc('is_evisa_admin').then(function (result) {
        if (result.error) throw result.error;
        return result.data === true;
      });
    };

    window.getEvisaAdminRecordsAsync = function () {
      return supabase
        .from(TABLE)
        .select('id,passport_number,visa_number,application_code,status,buffered,has_pdf,created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .then(function (result) {
          if (result.error) throw result.error;
          return (result.data || []).map(fromRow);
        });
    };

    window.addEvisaAdminRecordAsync = function (record) {
      return supabase.from(TABLE).insert(toRow(record)).select('id').single().then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
    };

    window.updateEvisaAdminRecordAsync = function (id, record) {
      if (!id) return Promise.reject(new Error('Record id is missing.'));
      return supabase.from(TABLE).update(toRow(record)).eq('id', id).select('id').single().then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
    };

    window.removeEvisaAdminRecordAsync = function (id) {
      if (!id) return Promise.reject(new Error('Record id is missing.'));
      return supabase.from(TABLE).delete().eq('id', id).select('id').single().then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
    };

    window.toggleEvisaBufferedAsync = function (id, buffered) {
      if (!id) return Promise.reject(new Error('Record id is missing.'));
      return supabase.from(TABLE).update({ buffered: !!buffered }).eq('id', id).select('id').single().then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
    };

    window.findEvisaByApplicationCodeAsync = function (code) {
      var value = norm(code);
      if (!value) return Promise.resolve(undefined);
      return supabase.rpc('lookup_evisa_by_application_code', {
        p_application_code: value
      }).then(firstRpcRow);
    };

    window.findEvisaByPassportVisaAsync = function (passport, visa) {
      var passportValue = norm(passport);
      var visaValue = norm(visa);
      if (!passportValue || !visaValue) return Promise.resolve(undefined);
      return supabase.rpc('lookup_evisa_by_passport_visa', {
        p_passport_number: passportValue,
        p_visa_number: visaValue
      }).then(firstRpcRow);
    };

    window.getEvisaPdfByApplicationCodeAsync = function (code) {
      var value = norm(code);
      if (!value) return Promise.resolve(null);
      return supabase.rpc('get_evisa_pdf_by_application_code', {
        p_application_code: value
      }).then(function (result) {
        if (result.error) throw result.error;
        return result.data || null;
      });
    };

    return true;
  }).catch(function (error) {
    console.warn('Evisa Supabase cloud init failed', error);
    return false;
  });
})();
