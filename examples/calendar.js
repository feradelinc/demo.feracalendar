// Illustrative direct API request; credentials stay in caller-owned memory.
export async function createEvent({calendarBase,instance,token,calendar,creator,date}) {
  const response = await fetch(calendarBase + '/api/v1/events', {
    method: 'POST', headers: {instance, 'x-auth-token':token, 'content-type':'application/json'},
    body: JSON.stringify({calendar,creator,title:'New Client Consultation',startsAt:date.start,endsAt:date.end,status:'confirmed',style:'event',allDay:false})
  });
  const data=await response.json();
  if(!response.ok||data.success===false)throw Error('Event request failed');
  return data;
}
